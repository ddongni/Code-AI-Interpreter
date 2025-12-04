import * as vscode from 'vscode';

// 해석 켜기/끄기 상태
let isAutoInterpretEnabled = false;
let inlayHintsProvider: vscode.Disposable | null = null;
let statusBarItem: vscode.StatusBarItem;
const interpretationCache = new Map<string, string>(); // 줄별 해석 캐시

// 서버 URL (하드코딩)
const SERVER_URL = 'https://faas-tor1-70ca848e.doserverless.co/api/v1/web/fn-8a83d9b2-585c-4100-96ab-e3b51f99460c/default/code-ai-interpreter';

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

		if (!response.ok) {
			const errorData = await response.json() as { error?: string };
			throw new Error(errorData.error || 'API request failed');
		}

		const data = await response.json() as { explanation?: string; error?: string };
		
		if (data.error) {
			throw new Error(data.error);
		}

		const explanation = data.explanation || 'Failed to get explanation';

		return {
			lineNumber,
			code: codeLine,
			explanation
		};
	} catch (error: any) {
		return {
			lineNumber,
			code: codeLine,
			explanation: `Error during interpretation: ${error.message}`
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

	context.subscriptions.push(toggleCommand, onDidChangeActiveEditor, onDidChangeDocument, onDidChangeConfiguration);
}

export function deactivate() {}
