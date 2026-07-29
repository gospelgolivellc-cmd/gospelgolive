FROM node:20-slim

# ffmpeg-static's generic prebuilt binary segfaults specifically on the
# RTMP output path on this host (confirmed via the relay's own
# /debug/selftest: identical command succeeds writing to a local file,
# crashes instantly against any real rtmp:// target). Installing ffmpeg
# via apt gives a build that's dynamically linked against this exact
# image's actual libraries instead of a generic static binary, and
# server.js already prefers whatever's on PATH over the npm package.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
