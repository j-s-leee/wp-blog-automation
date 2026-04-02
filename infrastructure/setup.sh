#!/bin/bash
# 블로그 자동화 도구 - 서버 초기 세팅 스크립트
# Oracle Cloud Free Tier / Ubuntu 22.04+ 기준

set -e

echo "========================================="
echo "  블로그 자동화 도구 - 서버 세팅 시작"
echo "========================================="

# 1. 시스템 업데이트
echo "[1/4] 시스템 업데이트 중..."
sudo apt update && sudo apt upgrade -y

# 2. Docker 설치
echo "[2/4] Docker 설치 중..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker $USER
    echo "Docker 설치 완료. 그룹 권한 적용을 위해 재접속이 필요할 수 있습니다."
else
    echo "Docker가 이미 설치되어 있습니다."
fi

# 3. Docker Compose 확인
echo "[3/4] Docker Compose 확인 중..."
if ! docker compose version &> /dev/null; then
    echo "Docker Compose가 설치되지 않았습니다. Docker 최신 버전을 설치해주세요."
    exit 1
fi
echo "Docker Compose 준비 완료."

# 4. 방화벽 설정 (Oracle Cloud iptables)
echo "[4/4] 방화벽 포트 개방 중 (80, 443)..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true

echo ""
echo "========================================="
echo "  서버 세팅 완료!"
echo "========================================="
echo ""
echo "다음 단계:"
echo "  1. cp .env.example .env"
echo "  2. .env 파일에서 비밀번호와 도메인 설정"
echo "  3. docker compose up -d"
echo "  4. https://your-n8n-domain 접속 확인"
echo ""
