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
        
        code_line = req_body.get('codeLine', '')
        language = req_body.get('language', 'English')
        
        if not code_line:
            return func.HttpResponse(
                json.dumps({"error": "codeLine parameter is required"}),
                status_code=400,
                mimetype="application/json"
            )
        
        # 언어 이름 매핑
        language_map = {
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
        }
        
        language_name = language_map.get(language, 'English')
        
        # OpenAI 클라이언트 초기화
        client = OpenAI(api_key=API_KEY)
        
        # GPT API 호출
        logging.info(f"Calling OpenAI API with code_line: {code_line}, language: {language_name}")
        response = client.responses.create(
            model="gpt-5-nano",
            input=f"Explain the following code in {language_name} briefly in 1-2 sentences:\n{code_line}"
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
