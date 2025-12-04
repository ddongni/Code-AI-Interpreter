# 함수 삭제 및 재배포 가이드

## 함수 삭제 방법

### DigitalOcean 대시보드에서 삭제

1. https://cloud.digitalocean.com/functions 접속
2. Functions → Your Namespace → `code-ai-interpreter` 함수 선택
3. Settings 탭 또는 함수 옆 "..." 메뉴에서 "Delete" 클릭
4. 확인 후 삭제

## 재배포 방법

함수를 삭제한 후 다음 명령어로 배포:

```bash
cd /Users/dongeun/Desktop/code-ai-interpreter/code-ai-interpreter/server_files/packages/default/functions/code-ai-interpreter

# 배포
doctl serverless deploy . --remote-build
```

또는 packages 전체를 배포:

```bash
cd /Users/dongeun/Desktop/code-ai-interpreter/code-ai-interpreter/server_files

doctl serverless deploy packages --remote-build
```

## 현재 파일 구조

```
server_files/
└── packages/
    └── default/
        └── functions/
            └── code-ai-interpreter/
                ├── __main__.py
                └── requirements.txt
```

## 배포 확인

배포 후 다음 명령어로 확인:

```bash
doctl serverless functions list
```

함수가 목록에 나타나면 성공입니다!







