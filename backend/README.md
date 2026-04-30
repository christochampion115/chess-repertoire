# Alpha Chess Backend

Backend API for Alpha Chess using Node.js, Express, SQLite, JWT authentication and Zod validation.

## Installation

1. Open a terminal in the `backend` folder.
2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
npm start
```

4. For development with auto-reload:

```bash
npm run dev
```

## API endpoints

### Auth

- `POST /api/auth/signup`
  - Body: `{ "username": "string", "email": "string", "password": "string" }`
- `POST /api/auth/login`
  - Body: `{ "email": "string", "password": "string" }`
- `POST /api/auth/logout`
  - Header: `Authorization: Bearer <token>`

### Lichess stats proxy

- `LICHESS_EXPLORER_HOST` defaults to `https://explorer.lichess.ovh`
- `LICHESS_EXPLORER_TOKEN` is optional, but required if the proxy rejects anonymous requests.
- Create a local `backend/.env` file with:
  ```env
  LICHESS_EXPLORER_HOST=https://explorer.lichess.ovh
  LICHESS_EXPLORER_TOKEN=your_token_here
  ```

### Repertoires

All repertoire endpoints require `Authorization: Bearer <token>`.

- `GET /api/repertoires`
- `POST /api/repertoires`
  - Body: `{ "name": "string", "color": "w" | "b", "fen": "string", "san": "string", "comment": "string" }`
- `PUT /api/repertoires/:id`
  - Body: partial update with the same fields as POST.
- `DELETE /api/repertoires/:id`

## Notes

- Data is stored in `backend/db/data.db`.
- JWT secret is configurable with `JWT_SECRET` environment variable.
