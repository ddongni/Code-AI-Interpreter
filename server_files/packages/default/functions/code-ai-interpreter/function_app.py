import azure.functions as func
import json
import logging
import os
from openai import OpenAI

# OpenAI API 키 (환경변수에서 가져오기)
API_KEY = os.getenv("OPENAI_API_KEY")

app = func.FunctionApp()

@app.route(route="code_ai_interpreter", auth_level=func.AuthLevel.ANONYMOUS, methods=["POST"])
def code_ai_interpreter(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Code AI Interpreter function processed a request.')
    
    try:
        # API 키 확인
        if not API_KEY:
            return func.HttpResponse(
                json.dumps({"error": "OpenAI API key is not configured"}),
                status_code=500,
                mimetype="application/json"
            )
        
        # 요청 본문 파싱
        try:
            req_body = req.get_json()
        except ValueError:
            return func.HttpResponse(
                json.dumps({"error": "Invalid JSON in request body"}),
                status_code=400,
                mimetype="application/json"
            )
        
        if not req_body:
            return func.HttpResponse(
                json.dumps({"error": "Request body is required"}),
                status_code=400,
                mimetype="application/json"
            )
        
        # codeLine (단일 줄) 또는 codeLines (여러 줄) 지원
        code_line = req_body.get('codeLine', '')
        code_lines = req_body.get('codeLines', [])
        language = req_body.get('language', 'English')
        
        # codeLines가 있으면 여러 줄 모드, 없으면 단일 줄 모드
        if code_lines:
            if not isinstance(code_lines, list) or len(code_lines) == 0:
                return func.HttpResponse(
                    json.dumps({"error": "codeLines must be a non-empty array"}),
                    status_code=400,
                    mimetype="application/json"
                )
        elif not code_line:
            return func.HttpResponse(
                json.dumps({"error": "codeLine or codeLines parameter is required"}),
                status_code=400,
                mimetype="application/json"
            )
        
        # 언어 이름 매핑 (응답 언어)
        language_map = {
            'English': 'English',
            'Korean': '한국어',
            'Japanese': '日本語',
            'Chinese (Simplified)': '简体中文',
            'Chinese (Traditional)': '繁體中文',
            'Spanish': 'Español',
            'French': 'Français',
            'German': 'Deutsch',
            'Portuguese': 'Português',
            'Russian': 'Русский',
            'Italian': 'Italiano',
            'Arabic': 'العربية',
            'Hindi': 'हिन्दी',
            'Vietnamese': 'Tiếng Việt',
            'Thai': 'ไทย'
        }
        
        language_name = language_map.get(language, 'English')
        
        # OpenAI 클라이언트 초기화
        client = OpenAI(api_key=API_KEY)
        
        if code_lines:
            # 여러 줄 모드: 파일 전체를 한 번에 해석
            # 각 줄에 번호를 매겨서 구분
            numbered_lines = [f"{i+1}. {line}" for i, line in enumerate(code_lines)]
            code_text = "\n".join(numbered_lines)
            
            prompt = f"""다음 코드를 {language_name}로 각 줄마다 간단하게 1-2문장으로 설명해주세요. 반드시 {language_name}로만 응답해주세요.

코드:
{code_text}

응답 형식 (JSON 배열):
[
  {{"lineNumber": 1, "explanation": "첫 번째 줄 설명 ({language_name}로)"}},
  {{"lineNumber": 2, "explanation": "두 번째 줄 설명 ({language_name}로)"}},
  ...
]

중요: 각 줄의 설명은 반드시 {language_name}로 작성하고, JSON 배열 형식으로만 반환해주세요. 다른 설명이나 주석은 추가하지 마세요."""
            
            logging.info(f"Calling OpenAI API with {len(code_lines)} lines, language: {language_name}")
            response = client.responses.create(
                model="gpt-5-nano",
                input=prompt
            )
            
            # 응답 파싱
            response_text = response.output_text.strip() if response.output_text else "[]"
            
            # JSON 배열 추출 시도 (마크다운 코드 블록이나 다른 텍스트 제거)
            import re
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if json_match:
                response_text = json_match.group(0)
            
            explanations = []
            try:
                # JSON 배열 파싱 시도
                parsed = json.loads(response_text)
                if isinstance(parsed, list):
                    explanations = parsed
                else:
                    raise ValueError("Response is not a list")
            except (json.JSONDecodeError, ValueError):
                # JSON 파싱 실패 시 각 줄에 대해 개별적으로 해석
                logging.warning("Failed to parse response as JSON, interpreting lines individually")
                for i, line in enumerate(code_lines):
                    try:
                        line_response = client.responses.create(
                            model="gpt-5-nano",
                            input=f"다음 코드를 {language_name}로 간단하게 1-2문장으로 설명해주세요. 반드시 {language_name}로만 응답해주세요:\n{line}"
                        )
                        explanations.append({
                            "lineNumber": i + 1,
                            "explanation": line_response.output_text.strip() if line_response.output_text else "No explanation"
                        })
                    except Exception as e:
                        logging.error(f"Error interpreting line {i+1}: {str(e)}")
                        explanations.append({
                            "lineNumber": i + 1,
                            "explanation": f"Error: {str(e)}"
                        })
            
            return func.HttpResponse(
                json.dumps({"explanations": explanations}),
                status_code=200,
                mimetype="application/json"
            )
        else:
            # 단일 줄 모드 (기존 방식 유지)
            logging.info(f"Calling OpenAI API with code_line: {code_line}, language: {language_name}")
            response = client.responses.create(
                model="gpt-5-nano",
                input=f"다음 코드를 {language_name}로 간단하게 1-2문장으로 설명해주세요. 반드시 {language_name}로만 응답해주세요:\n{code_line}"
            )
            
            # 응답에서 explanation 추출
            explanation = response.output_text.strip() if response.output_text else "No explanation returned"
            
            return func.HttpResponse(
                json.dumps({"explanation": explanation}),
                status_code=200,
                mimetype="application/json"
            )
        
    except Exception as e:
        import traceback
        logging.error(f"Error in code_ai_interpreter: {str(e)}")
        logging.error(traceback.format_exc())
        return func.HttpResponse(
            json.dumps({
                "error": str(e),
                "traceback": traceback.format_exc()
            }),
            status_code=500,
            mimetype="application/json"
        )