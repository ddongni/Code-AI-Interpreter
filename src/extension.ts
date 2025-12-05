import * as vscode from 'vscode';

// 서버 URL (Azure Functions)
const SERVER_URL = 'https://code-ai-interpreter.azurewebsites.net/api/code_ai_interpreter';

// 해석 캐시
const interpretationCache = new Map<string, string>();

// 설정에서 언어 가져오기
function getInterpretationLanguage(): string {
	const config = vscode.workspace.getConfiguration('codeAIInterpreter');
	const language = config.get<string>('interpretationLanguage', 'English');
	return language || 'English'; // 기본값은 English
}

// 언어별 주석 형식 반환
function getCommentPrefix(languageId: string): string {
	switch (languageId) {
		case 'python':
			return '# 🧠 ';
		case 'javascript':
		case 'typescript':
		case 'javascriptreact':
		case 'typescriptreact':
		case 'java':
		case 'c':
		case 'cpp':
		case 'csharp':
		case 'go':
		case 'rust':
		case 'swift':
		case 'kotlin':
		case 'dart':
			return '// 🧠 ';
		case 'html':
		case 'xml':
			return '<!-- 🧠 ';
		case 'css':
		case 'scss':
		case 'less':
		case 'sass':
			return '/* 🧠 ';
		case 'sql':
			return '-- 🧠 ';
		case 'shellscript':
		case 'bash':
		case 'powershell':
		case 'yaml':
		case 'yml':
			return '# 🧠 ';
		case 'ruby':
		case 'perl':
		case 'lua':
			return '# 🧠 ';
		default:
			return '// 🧠 '; // 기본값
	}
}

// 언어별 주석 종료 문자 반환 (여러 줄 주석용)
function getCommentSuffix(languageId: string): string {
	switch (languageId) {
		case 'html':
		case 'xml':
			return ' -->';
		case 'css':
		case 'scss':
		case 'less':
		case 'sass':
			return ' */';
		default:
			return '';
	}
}

// 여러 줄의 코드를 한 번에 해석
async function interpretLines(codeLines: string[]): Promise<Map<number, string>> {
	const result = new Map<number, string>();
	
	try {
		const language = getInterpretationLanguage();
		
		// 캐시 확인 (전체 코드를 키로 사용)
		const cacheKey = `${codeLines.join('\n')}:${language}`;
		const cached = interpretationCache.get(cacheKey);
		if (cached) {
			// 캐시된 결과가 있으면 파싱하여 반환
			try {
				const cachedData = JSON.parse(cached) as { explanations?: Array<{ lineNumber: number; explanation: string }> };
				if (cachedData.explanations) {
					cachedData.explanations.forEach(item => {
						result.set(item.lineNumber - 1, item.explanation); // lineNumber는 1부터 시작하므로 -1
					});
					return result;
				}
			} catch {
				// 캐시 파싱 실패 시 새로 요청
			}
		}

		const response = await fetch(SERVER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				codeLines: codeLines,
				language: language
			})
		});

		const responseText = await response.text();
		
		if (!response.ok) {
			let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
			try {
				const errorData = JSON.parse(responseText) as { error?: string; message?: string };
				errorMessage = errorData.error || errorData.message || errorMessage;
			} catch {
				if (responseText) {
					errorMessage = responseText.substring(0, 200);
				}
			}
			throw new Error(errorMessage);
		}

		let data: { explanations?: Array<{ lineNumber: number; explanation: string }>; error?: string; body?: string };
		try {
			data = JSON.parse(responseText);
		} catch (parseError) {
			throw new Error(`Invalid response format: ${responseText.substring(0, 100)}`);
		}

		if (data.error) {
			throw new Error(`Server error: ${data.error}`);
		}

		if (data.body) {
			try {
				const bodyData = JSON.parse(data.body);
				if (bodyData.error) {
					throw new Error(`Server error: ${bodyData.error}`);
				}
				data = bodyData;
			} catch (parseError: any) {
				if (parseError.message && parseError.message.includes('Server error')) {
					throw parseError;
				}
				throw new Error('Failed to parse response body');
			}
		}
		
		if (data.explanations && Array.isArray(data.explanations)) {
			data.explanations.forEach(item => {
				// lineNumber는 1부터 시작하므로 배열 인덱스로 변환 (0부터 시작)
				const index = item.lineNumber - 1;
				if (index >= 0 && index < codeLines.length) {
					result.set(index, item.explanation);
				}
			});
			
			// 캐시에 저장
			interpretationCache.set(cacheKey, JSON.stringify(data));
		} else {
			throw new Error('Invalid response format: explanations array not found');
		}
		
		return result;
	} catch (error: any) {
		console.error('Interpretation error:', error);
		let errorMessage = error.message || 'Unknown error occurred';
		if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('The request'))) {
			errorMessage = 'Network error. Please check your internet connection and try again.';
		}
		// 에러 발생 시 모든 줄에 에러 메시지 설정
		codeLines.forEach((_, index) => {
			result.set(index, `Error: ${errorMessage}`);
		});
		return result;
	}
}

// 주석 마커로 삽입된 설명 추적 (URI -> 줄 번호)
const insertedComments = new Map<string, Set<number>>();

// 코드 아래에 주석으로 설명 삽입
async function insertCommentsAsExplanations(document: vscode.TextDocument, explanations: Map<number, string>) {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
		return;
	}

	const uri = document.uri.toString();
	let insertedSet = insertedComments.get(uri);
	if (!insertedSet) {
		insertedSet = new Set<number>();
		insertedComments.set(uri, insertedSet);
	}

	// 언어별 주석 형식 가져오기
	const languageId = document.languageId;
	const commentPrefix = getCommentPrefix(languageId);
	const commentSuffix = getCommentSuffix(languageId);
	
	// 주석 시작 패턴 (기존 주석 삭제용)
	const commentPatterns = [
		'//',
		'#',
		'--',
		'<!--',
		'/*'
	];
	
	// 줄 번호를 역순으로 정렬하여 뒤에서부터 삽입 (줄 번호가 변경되지 않도록)
	const sortedLines = Array.from(explanations.keys()).sort((a, b) => b - a);

	await editor.edit(editBuilder => {
		for (const lineNumber of sortedLines) {
			const explanation = explanations.get(lineNumber);
			if (!explanation) continue;

			// 이미 주석이 삽입된 줄인지 확인
			if (insertedSet.has(lineNumber)) {
				// 기존 주석 업데이트 (여러 줄 주석도 처리)
				const nextLine = lineNumber + 1;
				let deleteLine = nextLine;
				
				// 연속된 설명 주석 줄 모두 삭제
				while (deleteLine < document.lineCount) {
					const existingLine = document.lineAt(deleteLine);
					const trimmed = existingLine.text.trim();
					// 기존 설명 주석인지 확인 (🧠로 시작하는 주석)
					const isComment = commentPatterns.some(pattern => trimmed.startsWith(pattern)) && trimmed.includes('🧠');
					if (isComment) {
						editBuilder.delete(existingLine.rangeIncludingLineBreak);
						deleteLine++;
					} else {
						break;
					}
				}
			}

			// 다음 줄에 주석 삽입 (한 줄로)
			const insertLine = lineNumber + 1;
			
			// 코드 줄의 들여쓰기 가져오기
			const codeLine = document.lineAt(lineNumber);
			const codeLineText = codeLine.text;
			const indentMatch = codeLineText.match(/^(\s*)/);
			const indent = indentMatch ? indentMatch[1] : '';
			
			// 줄의 시작 위치에 삽입 (들여쓰기는 주석 텍스트에 포함)
			const insertPosition = new vscode.Position(insertLine, 0);
			
			// "설명" 같은 단어 제거 및 주석 문자 정리
			let cleanedExplanation = explanation
				.replace(/설명/g, '')
				.replace(/이 코드는/g, '')
				.replace(/코드는/g, '')
				.replace(/합니다/g, '')
				.replace(/합니다\./g, '')
				.replace(/\/\//g, '') // 이미 있는 주석 기호 제거
				.replace(/#/g, '') // # 제거
				.replace(/--/g, '') // -- 제거
				.replace(/<!--/g, '') // <!-- 제거
				.replace(/\/\*/g, '') // /* 제거
				.replace(/\*\//g, '') // */ 제거
				.replace(/\n/g, ' ') // 줄바꿈을 공백으로
				.replace(/\s+/g, ' ')
				.trim();
			
			// 주석이 너무 길면 여러 줄로 나누기 (한 줄에 최대 100자)
			const maxLength = 100;
			let commentText = '';
			
			if (cleanedExplanation.length <= maxLength) {
				// 짧으면 한 줄로
				commentText = `${indent}${commentPrefix}${cleanedExplanation}${commentSuffix}\n`;
			} else {
				// 길면 여러 줄로 나누기
				const words = cleanedExplanation.split(' ');
				let currentLine = commentPrefix;
				
				for (const word of words) {
					const testLine = currentLine + (currentLine === commentPrefix ? '' : ' ') + word + commentSuffix;
					if (testLine.length > maxLength && currentLine !== commentPrefix) {
						commentText += `${indent}${currentLine}${commentSuffix}\n`;
						currentLine = commentPrefix + word;
					} else {
						if (currentLine !== commentPrefix) {
							currentLine += ' ';
						}
						currentLine += word;
					}
				}
				commentText += `${indent}${currentLine}${commentSuffix}\n`;
			}
			
			editBuilder.insert(insertPosition, commentText);
			
			insertedSet.add(lineNumber);
		}
	});
}

// 주석으로 설명 삽입
function updateInlayHints(document: vscode.TextDocument, explanations: Map<number, string>) {
	// 주석으로 설명 삽입 (전체 텍스트가 보이도록)
	insertCommentsAsExplanations(document, explanations);
}

// 선택한 줄들을 한번에 해석
async function interpretSelectedLines() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showWarningMessage('No active editor found.');
		return;
	}

	const document = editor.document;
	const selections = editor.selections;
	
	if (selections.length === 0 || selections.every(s => s.isEmpty)) {
		vscode.window.showWarningMessage('Please select lines to interpret.');
		return;
	}

	// 선택된 모든 줄 수집
	const selectedLines = new Set<number>();
	selections.forEach(selection => {
		for (let i = selection.start.line; i <= selection.end.line; i++) {
			selectedLines.add(i);
		}
	});

	const lines: { lineNumber: number; code: string }[] = [];
	
	// 선택된 줄 중 코드 줄만 수집
	selectedLines.forEach(lineNumber => {
		const line = document.lineAt(lineNumber);
		const trimmedLine = line.text.trim();
		
		if (trimmedLine && 
			!trimmedLine.startsWith('//') && 
			!trimmedLine.startsWith('/*') && 
			!trimmedLine.startsWith('*') &&
			!trimmedLine.startsWith('#') &&
			!trimmedLine.startsWith('--') &&
			!trimmedLine.startsWith("'")) {
			lines.push({
				lineNumber: lineNumber,
				code: trimmedLine
			});
		}
	});

	if (lines.length === 0) {
		vscode.window.showInformationMessage('No code lines found in selection.');
		return;
	}

	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: `Interpreting ${lines.length} selected lines...`,
		cancellable: false
	}, async (progress) => {
		progress.report({ increment: 0, message: 'Sending request to API...' });
		
		// 모든 코드 줄을 한 번에 보내기
		const codeLines = lines.map(l => l.code);
		const explanations = await interpretLines(codeLines);
		
		progress.report({ increment: 50, message: 'Processing results...' });
		
		// 해석 결과를 실제 줄 번호에 매핑
		const lineNumberMap = new Map<number, string>();
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const explanation = explanations.get(i) || 'No explanation available';
			lineNumberMap.set(line.lineNumber, explanation);
		}
		
		// Inlay Hints 업데이트
		updateInlayHints(document, lineNumberMap);
		
		progress.report({ increment: 100, message: 'Complete!' });
	});

	vscode.window.showInformationMessage(`Interpreted ${lines.length} selected lines.`);
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Code AI Interpreter extension is now active!');

	// 명령어: 선택한 줄들을 해석 (Cmd+R)
	const interpretSelectedLinesCommand = vscode.commands.registerCommand(
		'code-ai-interpreter.interpretSelectedLines',
		() => {
			interpretSelectedLines();
		}
	);

	context.subscriptions.push(
		interpretSelectedLinesCommand
	);
}

export function deactivate() {
	// 정리 작업
}
