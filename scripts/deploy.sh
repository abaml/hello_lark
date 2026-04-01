#!/bin/bash

# 检查环境变量
if [ -z "$FEISHU_APP_ID" ]; then
    echo "Error: FEISHU_APP_ID environment variable is not set"
    exit 1
fi

if [ -z "$FEISHU_APP_SECRET" ]; then
    echo "Error: FEISHU_APP_SECRET environment variable is not set"
    exit 1
fi

# 替换环境变量
sed -i "s/\${FEISHU_APP_ID}/$FEISHU_APP_ID/g" tce.yaml
sed -i "s/\${FEISHU_APP_SECRET}/$FEISHU_APP_SECRET/g" tce.yaml

# 部署到TCE
tce apply -f tce.yaml

echo "Deployment completed successfully!"
