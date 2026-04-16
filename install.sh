#!/bin/bash

# LLM Wiki开发环境安装脚本
# 使用方法: ./install.sh

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "========================================"
echo "    LLM Wiki开发环境安装脚本"
echo "========================================"
echo -e "${NC}"

# 检查Node.js版本
echo -e "${YELLOW}检查Node.js版本...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}错误: Node.js未安装${NC}"
    echo "请安装Node.js 20或更高版本: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2)
MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)
if [ $MAJOR_VERSION -lt 20 ]; then
    echo -e "${RED}错误: Node.js版本过低 (需要v20+)${NC}"
    exit 1
fi
echo -e "${GREEN}Node.js版本: v$NODE_VERSION${NC}"

# 检查npm
echo -e "${YELLOW}检查npm...${NC}"
if ! command -v npm &> /dev/null; then
    echo -e "${RED}错误: npm未安装${NC}"
    exit 1
fi
echo -e "${GREEN}npm版本: $(npm -v)${NC}"

# 安装OpenClaude CLI
echo -e "${YELLOW}安装OpenClaude CLI...${NC}"
if command -v openclaude &> /dev/null; then
    echo -e "${GREEN}OpenClaude CLI已安装: $(openclaude --version)${NC}"
else
    echo "正在安装@gitlawb/openclaude..."
    npm install -g @gitlawb/openclaude@0.3.0
    echo -e "${GREEN}OpenClaude CLI安装完成${NC}"
fi

# 安装服务器依赖
echo -e "${YELLOW}安装服务器依赖...${NC}"
cd server
if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}服务器依赖安装完成${NC}"
else
    echo -e "${GREEN}服务器依赖已存在${NC}"
fi
cd ..

# 构建TypeScript代码
echo -e "${YELLOW}构建TypeScript代码...${NC}"
cd server
npm run build
cd ..
echo -e "${GREEN}构建完成${NC}"

# 创建wiki-data目录
echo -e "${YELLOW}创建wiki-data目录结构...${NC}"
if [ ! -d "wiki-data" ]; then
    mkdir -p wiki-data/wiki wiki-data/raw
    echo -e "${GREEN}wiki-data目录已创建${NC}"
else
    echo -e "${GREEN}wiki-data目录已存在${NC}"
fi

# 复制环境变量模板
echo -e "${YELLOW}设置环境变量...${NC}"
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}已创建.env文件，请编辑该文件设置API密钥${NC}"
        echo -e "${YELLOW}重要: 请编辑 .env 设置 ANTHROPIC_API_KEY${NC}"
    else
        echo -e "${RED}警告: 未找到.env.example模板文件${NC}"
    fi
else
    echo -e "${GREEN}.env文件已存在${NC}"
fi

echo -e "\n${GREEN}安装完成！${NC}"
echo -e "接下来可以:"
echo -e "1. 编辑 ${BLUE}.env${NC} 文件设置API密钥"
echo -e "2. 使用 ${BLUE}./run.sh start${NC} 启动Docker服务"
echo -e "3. 或者使用 ${BLUE}npm run dev${NC} 在server目录下启动开发服务器"
echo -e "\n访问地址: ${BLUE}http://localhost:3001${NC}"