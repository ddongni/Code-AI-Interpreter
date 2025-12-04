import * as vscode from 'vscode';

// 서버 URL (Azure Functions)
const SERVER_URL = 'https://code-ai-interpreter.azurewebsites.net/api/code_ai_interpreter';

// 해석 캐시
const interpretationCache = new Map<string, string>();

// Inlay Hints를 위한 해석 결과 저장 (문서 URI -> 줄 번호 -> 설명)
const inlayHintsData = new Map<string, Map<number, string>>();

// 언어를 한글로 고정
function getInterpretationLanguage(): string {
	return 'Korean';
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

// Inlay Hints Provider 구현
class CodeInterpreterInlayHintsProvider implements vscode.InlayHintsProvider {
	provideInlayHints(
		document: vscode.TextDocument,
		range: vscode.Range,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.InlayHint[]> {
		const hints: vscode.InlayHint[] = [];
		const uri = document.uri.toString();
		const lineMap = inlayHintsData.get(uri);
		
		if (!lineMap) {
			return hints;
		}
		
		// 범위 내의 모든 줄에 대해 Inlay Hint 생성
		for (let lineNumber = range.start.line; lineNumber <= range.end.line; lineNumber++) {
			const explanation = lineMap.get(lineNumber);
			if (explanation) {
				const line = document.lineAt(lineNumber);
				const position = new vscode.Position(lineNumber, line.text.length);
				
				const hint = new vscode.InlayHint(
					position,
					` 💡 ${explanation}`,
					vscode.InlayHintKind.Type
				);
				
				// 스타일 설정
				hint.paddingLeft = true;
				hint.paddingRight = false;
				
				hints.push(hint);
			}
		}
		
		return hints;
	}
}

// Inlay Hints 데이터 업데이트 및 UI 새로고침
function updateInlayHints(document: vscode.TextDocument, explanations: Map<number, string>) {
	const uri = document.uri.toString();
	
	// 기존 데이터 가져오기 또는 새로 생성
	let lineMap = inlayHintsData.get(uri);
	if (!lineMap) {
		lineMap = new Map<number, string>();
		inlayHintsData.set(uri, lineMap);
	}
	
	// 해석 결과 업데이트
	explanations.forEach((explanation, lineNumber) => {
		lineMap.set(lineNumber, explanation);
	});
	
	// Inlay Hints 새로고침을 위해 문서 변경 이벤트 트리거
	// 작은 편집을 했다가 즉시 되돌려서 변경 이벤트 발생
	const editor = vscode.window.activeTextEditor;
	if (editor && editor.document.uri.toString() === uri) {
		const lastLine = document.lineAt(document.lineCount - 1);
		const endPosition = new vscode.Position(lastLine.lineNumber, lastLine.text.length);
		
		// 공백 추가 후 즉시 제거하여 변경 이벤트 발생
		editor.edit(editBuilder => {
			editBuilder.insert(endPosition, ' ');
		}).then(() => {
			editor.edit(editBuilder => {
				const range = new vscode.Range(endPosition, new vscode.Position(endPosition.line, endPosition.character + 1));
				editBuilder.delete(range);
			});
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

	// Inlay Hints Provider 등록
	const inlayHintsProvider = new CodeInterpreterInlayHintsProvider();
	const inlayHintsDisposable = vscode.languages.registerInlayHintsProvider(
		{ scheme: 'file' },
		inlayHintsProvider
	);

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

	context.subscriptions.push(
		inlayHintsDisposable,
		interpretFileLineByLineCommand,
		interpretSelectedLinesCommand
	);
}

export function deactivate() {
	// 정리 작업
}
