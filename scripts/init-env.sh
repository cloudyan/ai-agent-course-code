#!/bin/bash

# 环境变量初始化脚本
# 用途：自动创建 .env 文件或 symlink，支持 monorepo 多项目共享环境变量

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 .env.example 是否存在
if [ ! -f "$ROOT_DIR/.env.example" ]; then
    echo_error "未找到 .env.example 文件"
    exit 1
fi

# 检查根目录是否需要创建 .env
if [ ! -e "$ROOT_DIR/.env" ]; then
    echo_info "创建根目录 .env 文件..."
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    echo_info ".env 已创建，请编辑填入 API Key"
else
    # 检查是否为 symlink
    if [ -L "$ROOT_DIR/.env" ]; then
        echo_info "根目录 .env 为 symlink，跳过创建"
    else
        echo_info "根目录 .env 已存在，跳过创建"
    fi
fi

# 遍历所有一级子目录（排除 node_modules 等）
EXCLUDE_DIRS=("node_modules" "dist" ".git" ".pnpm-store" ".claude" "scripts" "docs")

for dir in "$ROOT_DIR"/*/; do
    # 跳过目录
    dir_name=$(basename "$dir")
    skip=false
    for exclude in "${EXCLUDE_DIRS[@]}"; do
        if [ "$dir_name" = "$exclude" ]; then
            skip=true
            break
        fi
    done

    if [ "$skip" = true ]; then
        continue
    fi

    # 检查子目录是否有 package.json（判断是否为项目子模块）
    if [ ! -f "$dir/package.json" ]; then
        continue
    fi

    # 处理子目录的 .env
    if [ -L "$dir.env" ]; then
        # 已存在 symlink，检查是否有效
        if [ -e "$dir.env" ]; then
            echo_info "$dir_name: .env symlink 已存在且有效"
        else
            echo_warn "$dir_name: .env symlink 已损坏，正在修复..."
            rm "$dir.env"
            ln -s "../.env" "$dir.env"
            echo_info "$dir_name: .env symlink 已修复"
        fi
    elif [ -f "$dir.env" ]; then
        # 存在普通文件，跳过
        echo_info "$dir_name: .env 为独立文件，跳过"
    else
        # 不存在 .env，创建 symlink
        echo_info "$dir_name: 创建 .env symlink -> ../.env"
        ln -s "../.env" "$dir.env"
    fi
done

echo ""
echo_info "环境变量初始化完成！"
echo ""
echo "下一步："
echo "  1. 编辑 .env 文件，填入你的 API Key"
echo "  2. 运行 pnpm install 安装依赖"
echo "  3. 进入子目录运行示例代码"
echo ""
