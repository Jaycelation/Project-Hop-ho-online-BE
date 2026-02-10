# Online Genealogy Platform

An online genealogy system designed for multi-user access, featuring family tree management, media storage, and video streaming. This project focuses on **Information Security Management**, implementing strict access control and audit logging.

## 1. Installation

### Prerequisites

* **Node.js**: v18 or higher.
* **MongoDB**: A running instance (Local or Atlas).
* **FFmpeg**: Required for HLS video transcoding.



### Steps

1. **Clone the repository:**
```bash
git clone <repository-url>
cd Project-Hop-ho-online-BE
```


2. **Install dependencies:**
```bash
npm install express mongoose dotenv jsonwebtoken bcryptjs multer faker
```


3. **Environment Setup:**
Create a `.env` file in the root directory:
```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_ACCESS_SECRET=your_secret
```


4. **Seed Database:**
Initialize the database with sample records (including at least 1,000 persons for final submission):


```bash
node src/db/dbLoad.js

```


5. **Start the Server:**
```bash
npm start

```



---

## 2. API Documentation

**Base URL:** `/api` 

### Authentication & Users

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/auth/login` | Login and receive tokens |
| POST | `/api/auth/register` | Register a new account |
| GET | `/api/users/me` | Get current user profile |
| GET | `/api/users` | Admin-only user list |

### Genealogy Management

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/branches` | List family branches |
| POST | `/api/persons` | Create a person profile |
| GET | `/api/persons/:id/tree` | Fetch genealogy tree structure |
| POST | `/api/relationships` | Link persons (parent, spouse, etc.) |

### Media & Events

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/events` | Create family events (e.g., anniversaries) |
| POST | `/api/media/upload` | Upload photos or videos |
| GET | `/api/media/stream/:id` | Get HLS stream for video playback |

### System & Security

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/search/persons` | Full-text search for family members |
| GET | `/api/audit` | Admin-only audit logs for tracking changes |
| GET | `/api/health` | Check API system status |

---

## 3. Security Features

* **Data Classification**: Assets are categorized into Public, Internal, and Sensitive.


* **Access Control**: Role-based access control (RBAC) enforced across all endpoints.


* **Auditability**: Every critical action is recorded in the Audit Log for traceability.
