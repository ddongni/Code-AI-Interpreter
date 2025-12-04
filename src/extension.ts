import * as vscode from 'vscode';

// 해석 켜기/끄기 상태
let isAutoInterpretEnabled = false;
let inlayHintsProvider: vscode.Disposable | null = null;
let statusBarItem: vscode.StatusBarItem;
const interpretationCache = new Map<string, string>(); // 줄별 해석 캐시
const blockInterpretationCache = new Map<string, string>(); // 블록별 해석 캐시
let clickInterpretEnabled = false; // 클릭 해석 모드
let blockDecorationType: vscode.TextEditorDecorationType | null = null;

// 서버 URL (Azure Functions)
const SERVER_URL = 'https://code-ai-interpreter.azurewebsites.net/api/code_ai_interpreter';

// 설정에서 언어 가져오기
function getInterpretationLanguage(): string {
	const config = vscode.workspace.getConfiguration('codeAIInterpreter');
	return config.get<string>('interpretationLanguage', 'English');
}

// 언어 이름을 실제 언어명으로 변환
function getLanguageName(language: string): string {
	const languageMap: { [key: string]: string } = {
		'English': 'English',
		'Korean': 'Korean',
		'Japanese': 'Japanese',
		'Chinese (Simplified)': 'Simplified Chinese',
		'Chinese (Traditional)': 'Traditional Chinese',
		'Spanish': 'Spanish',
		'French': 'French',
		'German': 'German',
		'Portuguese': 'Portuguese',
		'Russian': 'Russian',
		'Italian': 'Italian',
		'Arabic': 'Arabic',
		'Hindi': 'Hindi',
		'Vietnamese': 'Vietnamese',
		'Thai': 'Thai'
	};
	return languageMap[language] || 'English';
}

// 코드 블록을 해석
async function interpretBlock(blockCode: string): Promise<string> {
	try {
		const language = getInterpretationLanguage();
		
		const response = await fetch(SERVER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				codeLine: blockCode,
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

		let data: { explanation?: string; error?: string; body?: string };
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
		
		return data.explanation || 'Failed to get explanation';
	} catch (error: any) {
		console.error('Block interpretation error:', error);
		return `Error: ${error.message || 'Unknown error occurred'}`;
	}
}

// 코드 블록 파싱 (중괄호 기반)
interface CodeBlock {
	startLine: number;
	endLine: number;
	code: string;
}

function parseCodeBlocks(document: vscode.TextDocument): CodeBlock[] {
	const blocks: CodeBlock[] = [];
	const lines = [];
	
	for (let i = 0; i < document.lineCount; i++) {
		lines.push(document.lineAt(i).text);
	}

	let braceDepth = 0;
	let blockStart = -1;
	let blockStartLine = -1;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmedLine = line.trim();

		// 빈 줄이나 주석만 있는 줄은 스킵
		if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.startsWith('*')) {
			continue;
		}

		// 함수, 클래스, if, for, while 등 블록 시작 감지
		const isBlockStart = /^\s*(function|class|if|for|while|switch|try|catch|finally|else|else\s+if)\s*/.test(trimmedLine) ||
			/\{\s*$/.test(trimmedLine) ||
			/=>\s*\{/.test(trimmedLine);

		for (let j = 0; j < line.length; j++) {
			if (line[j] === '{') {
				if (braceDepth === 0 && isBlockStart) {
					blockStart = i;
					blockStartLine = i;
				}
				braceDepth++;
			} else if (line[j] === '}') {
				braceDepth--;
				if (braceDepth === 0 && blockStart !== -1) {
					// 블록 완성
					const blockCode = lines.slice(blockStart, i + 1).join('\n');
					blocks.push({
						startLine: blockStart,
						endLine: i,
						code: blockCode
					});
					blockStart = -1;
				}
			}
		}
	}

	// 블록이 없는 경우 각 줄을 개별 블록으로 처리
	if (blocks.length === 0) {
		for (let i = 0; i < lines.length; i++) {
			const trimmedLine = lines[i].trim();
			if (trimmedLine && !trimmedLine.startsWith('//') && !trimmedLine.startsWith('/*') && !trimmedLine.startsWith('*')) {
				blocks.push({
					startLine: i,
					endLine: i,
					code: trimmedLine
				});
			}
		}
	}

	return blocks;
}

// 파일 전체를 블록 단위로 해석
async function interpretFileByBlocks() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showWarningMessage('No active editor found.');
		return;
	}

	const document = editor.document;
	const blocks = parseCodeBlocks(document);

	if (blocks.length === 0) {
		vscode.window.showInformationMessage('No code blocks found to interpret.');
		return;
	}

	// Decoration 타입 생성
	if (blockDecorationType) {
		blockDecorationType.dispose();
	}

	blockDecorationType = vscode.window.createTextEditorDecorationType({
		after: {
			contentText: '',
			margin: '0 0 0 1em',
			color: new vscode.ThemeColor('descriptionForeground'),
			fontStyle: 'italic'
		},
		rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
	});

	const decorations: vscode.DecorationOptions[] = [];

	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: `Interpreting ${blocks.length} code blocks...`,
		cancellable: false
	}, async (progress) => {
		for (let i = 0; i < blocks.length; i++) {
			const block = blocks[i];
			progress.report({
				increment: 100 / blocks.length,
				message: `Block ${i + 1}/${blocks.length}`
			});

			// 캐시 확인
			const language = getInterpretationLanguage();
			const cacheKey = `${document.uri.toString()}:block:${block.startLine}:${block.endLine}:${language}`;
			let explanation = blockInterpretationCache.get(cacheKey);

			if (!explanation) {
				try {
					explanation = await interpretBlock(block.code);
					blockInterpretationCache.set(cacheKey, explanation);
				} catch (error: any) {
					explanation = `Error: ${error.message}`;
				}
			}

			// 블록 끝에 해석 표시
			const endPosition = new vscode.Position(block.endLine, document.lineAt(block.endLine).text.length);
			const decoration: vscode.DecorationOptions = {
				range: new vscode.Range(endPosition, endPosition),
				renderOptions: {
					after: {
						contentText: ` // 💡 ${explanation}`,
						margin: '0 0 0 1em',
						color: new vscode.ThemeColor('descriptionForeground'),
						fontStyle: 'italic'
					}
				}
			};
			decorations.push(decoration);
		}
	});

	// Decoration 적용
	editor.setDecorations(blockDecorationType, decorations);
	vscode.window.showInformationMessage(`Interpreted ${blocks.length} code blocks.`);
}

// 한 줄의 코드를 해석
async function interpretLine(codeLine: string, lineNumber: number): Promise<{ lineNumber: number; code: string; explanation: string }> {
	try {
		const language = getInterpretationLanguage();
		
		// 서버 API 호출
		const response = await fetch(SERVER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				codeLine: codeLine,
				language: language
			})
		});

		// 응답 텍스트 먼저 가져오기
		const responseText = await response.text();
		
		if (!response.ok) {
			// JSON 파싱 시도
			let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
			try {
				const errorData = JSON.parse(responseText) as { error?: string; message?: string };
				errorMessage = errorData.error || errorData.message || errorMessage;
			} catch {
				// JSON이 아니면 원본 텍스트 사용
				if (responseText) {
					errorMessage = responseText.substring(0, 200); // 최대 200자만
				}
			}
			throw new Error(errorMessage);
		}

		// JSON 파싱
		let data: { explanation?: string; error?: string; body?: string; code?: string };
		try {
			data = JSON.parse(responseText);
		} catch (parseError) {
			// 응답이 JSON이 아닌 경우
			throw new Error(`Invalid response format: ${responseText.substring(0, 100)}`);
		}

		// 에러 체크 (먼저 확인)
		if (data.error) {
			// 서버 에러 메시지 표시
			const errorMsg = data.error || 'Unknown server error';
			throw new Error(`Server error: ${errorMsg}`);
		}

		// body가 문자열인 경우 (DigitalOcean Functions 형식)
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
		
		const explanation = data.explanation || 'Failed to get explanation';

		return {
			lineNumber,
			code: codeLine,
			explanation
		};
	} catch (error: any) {
		// 에러 로깅
		console.error('Interpretation error:', error);
		return {
			lineNumber,
			code: codeLine,
			explanation: `Error: ${error.message || 'Unknown error occurred'}`
		};
	}
}

// Inlay Hints Provider 구현
class CodeInterpretationProvider implements vscode.InlayHintsProvider {
	async provideInlayHints(document: vscode.TextDocument, range: vscode.Range, token: vscode.CancellationToken): Promise<vscode.InlayHint[]> {
		if (!isAutoInterpretEnabled) {
			return [];
		}

		const hints: vscode.InlayHint[] = [];
		const lineCount = document.lineCount;

		// 각 줄에 대해 해석 요청
		for (let i = 0; i < lineCount && i < 100; i++) { // 최대 100줄까지만
			const line = document.lineAt(i);
			const lineText = line.text.trim();

			// 빈 줄이나 주석만 있는 줄은 스킵
			if (!lineText || lineText.startsWith('//') || lineText.startsWith('/*') || lineText.startsWith('*')) {
				continue;
			}

			// 캐시 확인 (언어도 포함)
			const language = getInterpretationLanguage();
			const cacheKey = `${document.uri.toString()}:${i}:${lineText}:${language}`;
			let explanation = interpretationCache.get(cacheKey);

			if (!explanation) {
				// 해석 요청 (비동기로 처리)
				try {
					const result = await interpretLine(lineText, i + 1);
					explanation = result.explanation;
					interpretationCache.set(cacheKey, explanation);
				} catch (error) {
					continue;
				}
			}

			// 줄 끝에 해석 추가
			const position = new vscode.Position(i, line.text.length);
			const hint = new vscode.InlayHint(
				position,
				` 💡 ${explanation}`,
				vscode.InlayHintKind.Parameter
			);
			hint.paddingLeft = true;
			hint.paddingRight = false;
			hints.push(hint);
		}

		return hints;
	}
}

// 해석 켜기/끄기 토글
function toggleAutoInterpret(context: vscode.ExtensionContext) {
	isAutoInterpretEnabled = !isAutoInterpretEnabled;

	if (isAutoInterpretEnabled) {
		// Inlay Hints Provider 등록
		const provider = new CodeInterpretationProvider();
		inlayHintsProvider = vscode.languages.registerInlayHintsProvider(
			{ scheme: 'file' },
			provider
		);
		context.subscriptions.push(inlayHintsProvider);

		// 상태바 업데이트
		const language = getInterpretationLanguage();
		statusBarItem.text = '$(check) Interpretation On';
		statusBarItem.tooltip = `Auto interpretation is enabled (${language}). Click to disable.`;
		statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentForeground');

		// 현재 에디터의 해석 새로고침
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			vscode.commands.executeCommand('vscode.executeInlayHintProvider', editor.document.uri);
		}

		vscode.window.showInformationMessage(`Auto interpretation enabled (${language}).`);
	} else {
		// Inlay Hints Provider 해제
		if (inlayHintsProvider) {
			inlayHintsProvider.dispose();
			inlayHintsProvider = null;
		}

		// 상태바 업데이트
		statusBarItem.text = '$(circle-slash) Interpretation Off';
		statusBarItem.tooltip = 'Auto interpretation is disabled. Click to enable.';
		statusBarItem.backgroundColor = undefined;

		// 캐시 초기화
		interpretationCache.clear();

		vscode.window.showInformationMessage('Auto interpretation disabled.');
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Code AI Interpreter extension is now active!');

	// 상태바 아이템 생성
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = '$(circle-slash) Interpretation Off';
	statusBarItem.tooltip = 'Auto interpretation is disabled. Click to enable.';
	statusBarItem.command = 'code-ai-interpreter.toggleAutoInterpret';
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	// 설정 변경 감지
	const onDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('codeAIInterpreter.interpretationLanguage')) {
			// 언어가 변경되면 캐시 초기화 및 해석 새로고침
			interpretationCache.clear();
			if (isAutoInterpretEnabled) {
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					const language = getInterpretationLanguage();
					statusBarItem.tooltip = `Auto interpretation is enabled (${language}). Click to disable.`;
					setTimeout(() => {
						vscode.commands.executeCommand('vscode.executeInlayHintProvider', editor.document.uri);
					}, 300);
				}
			}
		}
	});

	// 명령어: 해석 켜기/끄기 토글
	const toggleCommand = vscode.commands.registerCommand('code-ai-interpreter.toggleAutoInterpret', () => {
		toggleAutoInterpret(context);
	});

	// 명령어: 클릭 해석 모드 토글
	const toggleClickInterpretCommand = vscode.commands.registerCommand('code-ai-interpreter.toggleClickInterpret', () => {
		clickInterpretEnabled = !clickInterpretEnabled;
		if (clickInterpretEnabled) {
			vscode.window.showInformationMessage('Click interpretation mode enabled. Click on a code line to interpret it.');
		} else {
			vscode.window.showInformationMessage('Click interpretation mode disabled.');
		}
	});

	// 특정 줄에 해석 표시
	async function interpretLineAtPosition(lineNumber: number) {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		const line = editor.document.lineAt(lineNumber);
		const lineText = line.text.trim();

		if (!lineText || lineText.startsWith('//') || lineText.startsWith('/*') || lineText.startsWith('*')) {
			vscode.window.showInformationMessage('This line is empty or a comment.');
			return;
		}

		// 해석 요청
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'Interpreting line...',
			cancellable: false
		}, async () => {
			try {
				const result = await interpretLine(lineText, lineNumber + 1);
				
				// 해석 결과를 정보 메시지로 표시
				const message = `Line ${lineNumber + 1}: ${result.explanation}`;
				vscode.window.showInformationMessage(message);
				
				// 캐시에 저장
				const language = getInterpretationLanguage();
				const cacheKey = `${editor.document.uri.toString()}:${lineNumber}:${lineText}:${language}`;
				interpretationCache.set(cacheKey, result.explanation);
			} catch (error: any) {
				vscode.window.showErrorMessage(`Failed to interpret line: ${error.message}`);
			}
		});
	}

	// 커서 위치 변경 감지 (클릭 시)
	const onDidChangeTextEditorSelection = vscode.window.onDidChangeTextEditorSelection((event) => {
		if (clickInterpretEnabled && event.textEditor === vscode.window.activeTextEditor) {
			const lineNumber = event.selections[0].active.line;
			interpretLineAtPosition(lineNumber);
		}
	});

	// 명령어: 현재 줄 해석
	const interpretCurrentLineCommand = vscode.commands.registerCommand('code-ai-interpreter.interpretCurrentLine', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor.');
			return;
		}
		const lineNumber = editor.selection.active.line;
		interpretLineAtPosition(lineNumber);
	});

	// 명령어: 파일 전체를 블록 단위로 해석
	const interpretFileByBlocksCommand = vscode.commands.registerCommand('code-ai-interpreter.interpretFileByBlocks', () => {
		interpretFileByBlocks();
	});

	// 에디터 변경 감지
	const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (isAutoInterpretEnabled && editor) {
			// 에디터가 변경되면 해석 새로고침
			setTimeout(() => {
				vscode.commands.executeCommand('vscode.executeInlayHintProvider', editor.document.uri);
			}, 500);
		}
	});

	// 문서 변경 감지
	const onDidChangeDocument = vscode.workspace.onDidChangeTextDocument((event) => {
		if (isAutoInterpretEnabled && event.document === vscode.window.activeTextEditor?.document) {
			// 변경된 줄의 캐시 삭제
			event.contentChanges.forEach(change => {
				const startLine = change.range.start.line;
				const endLine = change.range.end.line;
				for (let i = startLine; i <= endLine; i++) {
					const keysToDelete: string[] = [];
					interpretationCache.forEach((value, key) => {
						if (key.includes(`:${i}:`)) {
							keysToDelete.push(key);
						}
					});
					keysToDelete.forEach(key => interpretationCache.delete(key));
				}
			});

			// 해석 새로고침
			setTimeout(() => {
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					vscode.commands.executeCommand('vscode.executeInlayHintProvider', editor.document.uri);
				}
			}, 1000);
		}
	});

	context.subscriptions.push(
		toggleCommand, 
		toggleClickInterpretCommand,
		interpretCurrentLineCommand,
		interpretFileByBlocksCommand,
		onDidChangeActiveEditor, 
		onDidChangeDocument, 
		onDidChangeConfiguration,
		onDidChangeTextEditorSelection
	);
}

export function deactivate() {
	if (blockDecorationType) {
		blockDecorationType.dispose();
	}
}

