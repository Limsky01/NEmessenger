# Voice SFU Server (mediasoup)

Отдельный voice-сервер для звонков в `NE Messenger`.

## Quick start

```bash
cd voice
npm install
cp .env.example .env
npm start
```

Проверка:

- `GET http://localhost:4010/health` -> `{ "ok": true }`

## Env

- `VOICE_PORT` - HTTP/socket.io порт
- `VOICE_HOST` - bind host
- `VOICE_ORIGIN` - CORS origins (через запятую)
- `VOICE_ANNOUNCED_IP` - внешний IP сервера (обязательно за NAT)
- `VOICE_RTC_MIN_PORT` / `VOICE_RTC_MAX_PORT` - UDP/TCP диапазон mediasoup

## Socket Events API

Все события поддерживают ack callback формата:

```js
ack({ ok: true, ...data })
ack({ ok: false, error: '...' })
```

### 1) Вход в комнату

- client -> `joinRoom({ roomId, userId, displayName }, ack)`
- ack -> `{ rtpCapabilities, producerIds }`

### 2) Транспорты

- client -> `createWebRtcTransport({ roomId, direction }, ack)`
- ack -> `{ transportOptions }`

- client -> `connectWebRtcTransport({ roomId, transportId, dtlsParameters }, ack)`

### 3) Producer

- client -> `produce({ roomId, transportId, kind, rtpParameters, appData }, ack)`
- ack -> `{ producerId }`

Сервер рассылает:
- `newProducer({ peerId, producerId, kind })`
- `producerClosed({ producerId })`

### 4) Consumer

- client -> `consume({ roomId, transportId, producerId, rtpCapabilities }, ack)`
- ack -> `{ consumerOptions }`

- client -> `resumeConsumer({ roomId, consumerId }, ack)`

Сервер рассылает:
- `consumerClosed({ consumerId, producerId })`

### 5) Выход

- client -> `leaveRoom({ roomId }, ack)`
- server event -> `peerLeft({ peerId })`

## Важно для продакшена

- Добавьте TURN-сервер (`coturn`) для стабильной связи за сложным NAT/Firewall.
- Откройте диапазон `VOICE_RTC_MIN_PORT..VOICE_RTC_MAX_PORT`.
- Используйте TLS на edge (reverse proxy) и авторизацию сокета (JWT).
