# Virtual Exhibition — Backend API

A backend service that aggregates artwork data from multiple museum APIs and exposes RESTful endpoints for the Virtual Exhibition platform. Users can browse and search artworks from the Harvard Art Museums and Victoria & Albert Museum in a single unified API.

---

## 🔗 Links

- **Live API:** [se-exhibiton-be-dawn-grass-6783.fly.dev](https://se-exhibiton-be-dawn-grass-6783.fly.dev/)
- **Frontend Repo:** [github.com/Sultan0013/Virtual-Exhibiton](https://github.com/Sultan0013/Virtual-Exhibiton)
- **Live Site:** [mueseumexhibition.netlify.app](https://mueseumexhibition.netlify.app/)

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| External APIs | Harvard Art Museums, Victoria & Albert Museum |
| Hosting | Fly.io |

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/all-artworks` | Fetch artworks from both Harvard and V&A APIs |
| GET | `/api/artwork/:id` | Get detailed info for a specific artwork |

---

## ⚙️ Local Setup

### 1. Clone the repo

```bash
git clone https://github.com/Sultan0013/SE-Exhibiton-BE.git
cd SE-Exhibiton-BE
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create environment file

Create a `.env` file at the project root with the following:

```env
PORT=4157
HARVARD_API_KEY=your_harvard_api_key_here
HARVARD_BASE_URL=https://api.harvardartmuseums.org
VNA_BASE_URL=https://api.vam.ac.uk/v2
```

> Get a free Harvard API key here: [Harvard Art Museums API signup](https://docs.google.com/forms/d/e/1FAIpQLSfkmEBqH76HLMMiCC-GPPnhcvHC9aJS86E32dOd0Z8MpY2rvQ/viewform)
> The V&A API is public and requires no key.
> This file is gitignored — never commit it.

### 4. Start the server

```bash
node server.js
```

Server runs at [http://localhost:4157](http://localhost:4157)

---

## Requirements

- Node.js `v14+`

---

## Data Sources

- [Harvard Art Museums API](https://harvardartmuseums.org/collections/api)
- [Victoria and Albert Museum API](https://www.vam.ac.uk/api)

---

