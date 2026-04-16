#!/bin/bash

# LLM Wiki一键启动脚本
# 使用方法: ./run.sh [start|stop|restart|status|logs|build|clean]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目信息
PROJECT_NAME="LLM Wiki"
VERSION="1.0.0"
DOCKER_COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"

# 检查docker-compose是否可用
check_docker_compose() {
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}错误: docker-compose未安装${NC}"
        echo "请安装Docker Compose: https://docs.docker.com/compose/install/"
        exit 1
    fi
}

# 检查环境文件
check_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${YELLOW}警告: 未找到环境配置文件 $ENV_FILE${NC}"
        echo -e "正在从模板创建..."
        if [ -f ".env.example" ]; then
            cp .env.example .env
            echo -e "${GREEN}已创建 $ENV_FILE，请编辑该文件设置API密钥${NC}"
            echo -e "${YELLOW}重要: 请编辑 $ENV_FILE 设置 ANTHROPIC_API_KEY${NC}"
            exit 1
        else
            echo -e "${RED}错误: 未找到 .env.example 模板文件${NC}"
            exit 1
        fi
    fi

    # 检查API密钥是否设置
    if ! grep -q "ANTHROPIC_API_KEY=" "$ENV_FILE" || grep -q "ANTHROPIC_API_KEY=your_anthropic_api_key_here" "$ENV_FILE"; then
        echo -e "${RED}错误: 请编辑 $ENV_FILE 设置有效的 ANTHROPIC_API_KEY${NC}"
        exit 1
    fi
}

# 检查wiki-data目录
check_wiki_data() {
    if [ ! -d "wiki-data" ]; then
        echo -e "${YELLOW}创建wiki-data目录...${NC}"
        mkdir -p wiki-data/wiki wiki-data/raw
        echo -e "${GREEN}已创建wiki-data目录结构${NC}"
    fi
}

# 显示标题
show_header() {
    echo -e "${BLUE}"
    echo "========================================"
    echo "    $PROJECT_NAME - Docker管理脚本"
    echo "    版本: $VERSION"
    echo "========================================"
    echo -e "${NC}"
}

# 启动服务
start_service() {
    echo -e "${GREEN}启动 $PROJECT_NAME 服务...${NC}"
    check_env_file
    check_wiki_data

    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d

    echo -e "${GREEN}服务启动完成！${NC}"
    echo -e "访问地址: ${BLUE}http://localhost:3001${NC}"
    echo -e "查看日志: ${YELLOW}./run.sh logs${NC}"
}

# 停止服务
stop_service() {
    echo -e "${YELLOW}停止 $PROJECT_NAME 服务...${NC}"
    docker-compose -f "$DOCKER_COMPOSE_FILE" down
    echo -e "${GREEN}服务已停止${NC}"
}

# 重启服务
restart_service() {
    echo -e "${YELLOW}重启 $PROJECT_NAME 服务...${NC}"
    docker-compose -f "$DOCKER_COMPOSE_FILE" restart
    echo -e "${GREEN}服务已重启${NC}"
}

# 查看状态
status_service() {
    echo -e "${BLUE}$PROJECT_NAME 服务状态:${NC}"
    docker-compose -f "$DOCKER_COMPOSE_FILE" ps

    echo -e "\n${BLUE}容器资源使用:${NC}"
    docker stats --no-stream $(docker-compose -f "$DOCKER_COMPOSE_FILE" ps -q) 2>/dev/null || echo "无法获取资源使用信息"
}

# 查看日志
logs_service() {
    echo -e "${BLUE}查看 $PROJECT_NAME 日志:${NC}"
    docker-compose -f "$DOCKER_COMPOSE_FILE" logs -f
}

# 构建镜像
build_service() {
    echo -e "${GREEN}构建 $PROJECT_NAME Docker镜像...${NC}"
    docker-compose -f "$DOCKER_COMPOSE_FILE" build --no-cache
    echo -e "${GREEN}镜像构建完成${NC}"
}

# 清理资源
clean_service() {
    echo -e "${YELLOW}清理Docker资源...${NC}"
    echo "1. 停止并删除容器"
    echo "2. 删除未使用的镜像"
    echo "3. 删除未使用的卷"
    echo "4. 删除未使用的网络"
    echo -e "${RED}警告: 此操作将删除所有未使用的Docker资源${NC}"

    read -p "是否继续? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose -f "$DOCKER_COMPOSE_FILE" down -v
        docker system prune -a -f
        echo -e "${GREEN}清理完成${NC}"
    else
        echo -e "${YELLOW}取消清理${NC}"
    fi
}

# 更新服务
update_service() {
    echo -e "${GREEN}更新 $PROJECT_NAME 服务...${NC}"

    # 拉取最新代码（如果有git）
    if [ -d ".git" ]; then
        echo "拉取最新代码..."
        git pull
    fi

    # 重建镜像
    docker-compose -f "$DOCKER_COMPOSE_FILE" build --pull

    # 重启服务
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d --force-recreate

    echo -e "${GREEN}更新完成${NC}"
}

# 备份数据
backup_service() {
    echo -e "${GREEN}备份wiki数据...${NC}"

    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="wiki-data-backup-$timestamp.tar.gz"

    if [ -d "wiki-data" ]; then
        tar -czf "$backup_file" wiki-data/
        echo -e "${GREEN}备份完成: $backup_file${NC}"
        echo -e "大小: $(du -h "$backup_file" | cut -f1)"
    else
        echo -e "${YELLOW}未找到wiki-data目录${NC}"
    fi
}

# 显示帮助
show_help() {
    echo -e "${BLUE}使用方法: ./run.sh [命令]${NC}"
    echo ""
    echo "命令:"
    echo "  start    启动服务"
    echo "  stop     停止服务"
    echo "  restart  重启服务"
    echo "  status   查看状态"
    echo "  logs     查看日志"
    echo "  build    构建镜像"
    echo "  clean    清理Docker资源"
    echo "  update   更新服务"
    echo "  backup   备份数据"
    echo "  help     显示帮助"
    echo ""
    echo "示例:"
    echo "  ./run.sh start    # 启动服务"
    echo "  ./run.sh logs     # 查看日志"
    echo ""
}

# 主函数
main() {
    check_docker_compose
    show_header

    case "$1" in
        start)
            start_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            restart_service
            ;;
        status)
            status_service
            ;;
        logs)
            logs_service
            ;;
        build)
            build_service
            ;;
        clean)
            clean_service
            ;;
        update)
            update_service
            ;;
        backup)
            backup_service
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            if [ -z "$1" ]; then
                echo -e "${YELLOW}未指定命令，使用默认命令: start${NC}"
                start_service
            else
                echo -e "${RED}未知命令: $1${NC}"
                show_help
                exit 1
            fi
            ;;
    esac
}

# 执行主函数
main "$@"