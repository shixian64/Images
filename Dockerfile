FROM node:22-bookworm-slim

WORKDIR /app

ENV PORT=8787

# 当前项目无第三方 npm 依赖，直接复制源码即可。
COPY --chown=node:node . .

# SQLite 数据库、WAL 与生成图片都写入 /app/generated。
RUN mkdir -p /app/generated && chown -R node:node /app

USER node

EXPOSE 8787

CMD ["node", "--experimental-sqlite", "scripts/start.js"]
