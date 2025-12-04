import * as vscode from 'vscode';

// 서버 URL (Azure Functions)
const SERVER_URL = 'https://code-ai-interpreter.azurewebsites.net/api/code_ai_interpreter';

// 해석 캐시
const interpretationCache = new Map<string, string>();

// 설정에서 언어 가져오기
function getInterpretationLanguage(): string {
	const config = vscode.workspace.getConfiguration('codeAIInterpreter');
	const language = config.get<string>('interpretationLanguage', 'English');
	console.log(`[Code AI Interpreter] Current language setting: ${language}`);
	return language;
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

// 파일의 언어에 맞는 주석 기호 가져오기
function getCommentPrefix(document: vscode.TextDocument): string {
	const languageId = document.languageId;
	
	// 주석 기호 매핑
	const commentMap: { [key: string]: string } = {
		'javascript': '//',
		'typescript': '//',
		'javascriptreact': '//',
		'typescriptreact': '//',
		'java': '//',
		'c': '//',
		'cpp': '//',
		'csharp': '//',
		'go': '//',
		'rust': '//',
		'swift': '//',
		'kotlin': '//',
		'dart': '//',
		'python': '#',
		'ruby': '#',
		'shellscript': '#',
		'yaml': '#',
		'perl': '#',
		'php': '//',
		'html': '<!--',
		'xml': '<!--',
		'css': '/*',
		'scss': '//',
		'less': '//',
		'sql': '--',
		'lua': '--',
		'vb': "'",
		'powershell': '#'
	};
	
	return commentMap[languageId] || '//';
}

// 주석을 줄 아래에 삽입
async function insertCommentBelowLine(editor: vscode.TextEditor, lineNumber: number, explanation: string) {
	const document = editor.document;
	const commentPrefix = getCommentPrefix(document);
	const commentText = `${commentPrefix} 💡 ${explanation}`;
	
	// 다음 줄의 시작 위치 찾기
	const nextLineNumber = lineNumber + 1;
	const nextLine = nextLineNumber < document.lineCount 
		? document.lineAt(nextLineNumber) 
		: null;
	
	// 다음 줄이 이미 주석인지 확인 (중복 방지)
	if (nextLine && nextLine.text.trim().startsWith(commentPrefix)) {
		// 이미 주석이 있으면 업데이트
		const range = new vscode.Range(
			new vscode.Position(nextLineNumber, 0),
			new vscode.Position(nextLineNumber, nextLine.text.length)
		);
		await editor.edit(editBuilder => {
			editBuilder.replace(range, commentText);
		});
	} else {
		// 새 주석 삽입
		const insertPosition = nextLineNumber < document.lineCount
			? new vscode.Position(nextLineNumber, 0)
			: new vscode.Position(lineNumber, document.lineAt(lineNumber).text.length);
		
		await editor.edit(editBuilder => {
			if (nextLineNumber < document.lineCount) {
				editBuilder.insert(insertPosition, commentText + '\n');
			} else {
				editBuilder.insert(insertPosition, '\n' + commentText);
			}
		});
	}
}

// 파일 전체를 한번에 해석
async function interpretFileLineByLine() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showWarningMessage('No active editor found.');
		return;
	}

	const document = editor.document;
	const lines: { lineNumber: number; code: string }[] = [];
	
	// 코드 줄만 수집 (빈 줄, 주석 제외)
	for (let i = 0; i < document.lineCount; i++) {
		const line = document.lineAt(i);
		const trimmedLine = line.text.trim();
		
		if (trimmedLine && 
			!trimmedLine.startsWith('//') && 
			!trimmedLine.startsWith('/*') && 
			!trimmedLine.startsWith('*') &&
			!trimmedLine.startsWith('#') &&
			!trimmedLine.startsWith('--') &&
			!trimmedLine.startsWith("'")) {
			lines.push({
				lineNumber: i,
				code: trimmedLine
			});
		}
	}

	if (lines.length === 0) {
		vscode.window.showInformationMessage('No code lines found to interpret.');
		return;
	}

	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: `Interpreting ${lines.length} lines...`,
		cancellable: false
	}, async (progress) => {
		progress.report({ increment: 0, message: 'Sending request to API...' });
		
		// 모든 코드 줄을 한 번에 보내기
		const codeLines = lines.map(l => l.code);
		const explanations = await interpretLines(codeLines);
		
		progress.report({ increment: 50, message: 'Processing results...' });
		
		// 역순으로 처리하여 줄 번호가 변경되지 않도록 함
		for (let i = lines.length - 1; i >= 0; i--) {
			const line = lines[i];
			const explanation = explanations.get(i) || 'No explanation available';
			await insertCommentBelowLine(editor, line.lineNumber, explanation);
		}
		
		progress.report({ increment: 100, message: 'Complete!' });
	});

	vscode.window.showInformationMessage(`Interpreted ${lines.length} lines.`);
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
		
		// 역순으로 처리하여 줄 번호가 변경되지 않도록 함
		for (let i = lines.length - 1; i >= 0; i--) {
			const line = lines[i];
			const explanation = explanations.get(i) || 'No explanation available';
			await insertCommentBelowLine(editor, line.lineNumber, explanation);
		}
		
		progress.report({ increment: 100, message: 'Complete!' });
	});

	vscode.window.showInformationMessage(`Interpreted ${lines.length} selected lines.`);
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Code AI Interpreter extension is now active!');

	// 명령어: 파일 전체를 한줄씩 해석
	const interpretFileLineByLineCommand = vscode.commands.registerCommand(
		'code-ai-interpreter.interpretFileLineByLine',
		() => {
			interpretFileLineByLine();
		}
	);

	// 명령어: 선택한 줄들을 해석 (Cmd+R)
	const interpretSelectedLinesCommand = vscode.commands.registerCommand(
		'code-ai-interpreter.interpretSelectedLines',
		() => {
			interpretSelectedLines();
		}
	);

	// 설정 변경 감지 (언어 변경 시 캐시 초기화)
	const onDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('codeAIInterpreter.interpretationLanguage')) {
			const newLanguage = getInterpretationLanguage();
			interpretationCache.clear();
			vscode.window.showInformationMessage(`Interpretation language changed to: ${newLanguage}`);
			console.log(`[Code AI Interpreter] Language changed to: ${newLanguage}`);
		}
	});

	context.subscriptions.push(
		interpretFileLineByLineCommand,
		interpretSelectedLinesCommand,
		onDidChangeConfiguration
	);
}

export function deactivate() {
	// 정리 작업
}
