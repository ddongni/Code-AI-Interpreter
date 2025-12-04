# DigitalOcean Functions 배포 가이드

## 파일 구조

```
server_files/
├── __main__.py          # 메인 함수 코드
└── requirements.txt     # Python 의존성
```

## 배포 방법

### 방법 1: DigitalOcean 대시보드 사용

1. DigitalOcean 대시보드 → Functions → Your Namespace → Your Function
2. **Code 탭**에서:
   - `__main__.py` 파일의 내용을 복사하여 붙여넣기
3. **Dependencies 탭**에서:
   - `requirements.txt` 파일의 내용을 복사하여 붙여넣기
   - 또는 "Add Dependency" 버튼을 클릭하여 `openai>=1.0.0` 추가
4. **Save** 버튼 클릭

### 방법 2: CLI 사용

```bash
# doctl 설치 및 로그인 (아직 안 했다면)
doctl auth init

# 함수 배포
doctl serverless deploy server_files/ --remote-build
```

## 중요 사항

⚠️ **requirements.txt 파일이 반드시 필요합니다!**

DigitalOcean Functions는 `requirements.txt` 파일을 통해 Python 패키지를 설치합니다. 이 파일이 없으면 `openai` 모듈을 찾을 수 없어 에러가 발생합니다.

## 확인 방법

배포 후 다음 명령어로 테스트:

```bash
curl -X POST https://faas-tor1-70ca848e.doserverless.co/api/v1/web/fn-8a83d9b2---85c-4100-96ab-e3b51f99460c/default/code-ai-interpreter \
  -H "Content-Type: application/json" \
  -d '{"codeLine": "const x = 10;", "language": "English"}'
```

성공하면 다음과 같은 응답이 나와야 합니다:

```json
{
  "explanation": "Initializes a constant variable x with the value 10"
}
```



