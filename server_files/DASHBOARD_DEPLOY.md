# DigitalOcean Functions 대시보드 배포 가이드

doctl 배포가 작동하지 않을 경우, 대시보드에서 직접 배포하는 방법입니다.

## 배포 방법

### 1. 함수 생성/편집

1. https://cloud.digitalocean.com/functions 접속
2. Functions → Your Namespace (`Code AI Interpreter`) 클릭
3. "Create Function" 버튼 클릭 (또는 기존 함수가 있으면 클릭)

### 2. 함수 설정

**Function Name**: `code-ai-interpreter`

**Runtime**: `Python 3.9`

### 3. 코드 입력

**Code 탭**에서 다음 파일 내용을 복사하여 붙여넣기:

`packages/default/functions/code-ai-interpreter/__main__.py` 파일의 전체 내용

### 4. Dependencies 설정

**Dependencies 탭**에서:

```
openai>=1.0.0
```

또는 "Add Dependency" 버튼으로 `openai` 패키지 추가

### 5. 저장 및 배포

- "Save" 버튼 클릭
- 함수가 자동으로 배포됩니다

## 배포 확인

배포 후 함수 URL 확인:

```
https://faas-tor1-70ca848e.doserverless.co/api/v1/web/fn-8a83d9b2-585c-4100-96ab-e3b51f99460c/default/code-ai-interpreter
```

## 테스트

```bash
curl -X POST https://faas-tor1-70ca848e.doserverless.co/api/v1/web/fn-8a83d9b2-585c-4100-96ab-e3b51f99460c/default/code-ai-interpreter \
  -H "Content-Type: application/json" \
  -d '{"codeLine": "const x = 10;", "language": "English"}'
```

성공하면 다음과 같은 응답이 나옵니다:

```json
{
  "explanation": "Initializes a constant variable x with the value 10"
}
```












