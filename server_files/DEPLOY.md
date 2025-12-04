# DigitalOcean Functions 배포 가이드 (doctl 사용)

## 사전 준비

### 1. doctl 설치

**macOS:**
```bash
brew install doctl
```

**Linux:**
```bash
cd ~
wget https://github.com/digitalocean/doctl/releases/download/v1.104.0/doctl-1.104.0-linux-amd64.tar.gz
tar xf doctl-1.104.0-linux-amd64.tar.gz
sudo mv doctl /usr/local/bin
```

**Windows:**
- https://github.com/digitalocean/doctl/releases 에서 다운로드

### 2. doctl 인증

```bash
# DigitalOcean API 토큰 생성
# 1. https://cloud.digitalocean.com/account/api/tokens 접속
# 2. "Generate New Token" 클릭
# 3. 토큰 이름 입력 후 생성
# 4. 생성된 토큰 복사

# doctl 인증
doctl auth init
# 토큰을 입력하라고 나오면 위에서 복사한 토큰 붙여넣기
```

## 배포 방법

### 1. 네임스페이스 확인 또는 생성

```bash
# 기존 네임스페이스 확인
doctl serverless namespaces list

# 네임스페이스가 없으면 생성 (대시보드에서 생성해도 됨)
# 대시보드: Functions → Create Namespace
```

### 2. 함수 배포

**방법 1: 함수 폴더 직접 배포 (권장)**

```bash
# server_files 폴더로 이동
cd server_files

# 함수 배포 (__main__.py와 requirements.txt가 같은 폴더에 있어야 함)
doctl serverless deploy . --remote-build
```

**방법 2: packages 구조 사용**

```bash
# packages/default/functions/code-ai-interpreter/ 구조로 배포
doctl serverless deploy packages/default/functions/code-ai-interpreter --remote-build
```

**중요**: `__main__.py`와 `requirements.txt` 파일이 같은 디렉토리에 있어야 합니다!

### 3. 배포 확인

```bash
# 배포된 함수 목록 확인
doctl serverless functions list

# 함수 URL 확인
doctl serverless functions get code-ai-interpreter --url
```

## 파일 구조

배포 전에 다음 구조를 확인하세요:

```
server_files/
├── __main__.py          # 메인 함수 코드
├── requirements.txt     # Python 의존성 (필수!)
└── project.yml          # 프로젝트 설정 (선택사항)
```

## 중요 사항

1. **requirements.txt 필수**: 이 파일이 있어야 `openai` 패키지가 자동으로 설치됩니다.
2. **remote-build 권장**: `--remote-build` 플래그를 사용하면 DigitalOcean에서 빌드가 수행됩니다.
3. **함수 이름**: `project.yml`의 함수 이름과 실제 폴더/파일 이름이 일치해야 합니다.

## 업데이트

코드를 수정한 후 다시 배포:

```bash
cd server_files
doctl serverless deploy . --remote-build
```

## 테스트

배포 후 테스트:

```bash
curl -X POST https://faas-tor1-70ca848e.doserverless.co/api/v1/web/fn-8a83d9b2-585c-4100-96ab-e3b51f99460c/default/code-ai-interpreter \
  -H "Content-Type: application/json" \
  -d '{"codeLine": "const x = 10;", "language": "English"}'
```

## 문제 해결

### 에러: "No module named 'openai'"
- `requirements.txt` 파일이 있는지 확인
- `--remote-build` 플래그 사용 확인

### 에러: "Invalid function"
- `__main__.py` 파일 이름 확인
- `main` 함수가 정의되어 있는지 확인

### 배포 실패
- doctl이 최신 버전인지 확인: `doctl version`
- 네임스페이스가 올바른지 확인: `doctl serverless namespaces list`

