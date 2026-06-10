FROM node:22-bookworm-slim@sha256:7af03b14a13c8cdd38e45058fd957bf00a72bbe17feac43b1c15a689c029c732

WORKDIR /app

ENV PORT=8787

# 当前项目无第三方 npm 依赖，直接复制源码即可。
COPY --chown=node:node . .

# SQLite 数据库、WAL 与生成图片都写入 /app/generated。
RUN mkdir -p /app/generated && chown -R node:node /app

USER node

EXPOSE 8787

CMD ["node", "--experimental-sqlite", "scripts/start.js"]
