# Warehouse and Supply Chain Inventory System

A fully functional, local prototype of an enterprise **Warehouse and Supply Chain Inventory System** built for college demonstration. The system showcases authoritative inventory consistency, transactional outbox pattern, and real **RabbitMQ publish/subscribe** event streaming without requiring Docker, cloud services, or paid APIs.

---

## 1. High-Level Design (HLD) & Architecture

```
                      ┌────────────────────────────────────────┐
                      │          React 19 + Vite UI            │
                      │        http://localhost:5173           │
                      └──────────────────┬─────────────────────┘
                                         │ REST (JSON)
                                         ▼
                      ┌────────────────────────────────────────┐
                      │         Node.js + Express API          │
                      │        http://localhost:5000           │
                      └────┬───────────────────────────────┬───┘
                           │                               │
        PostgreSQL Atomic  │                               │ Read Delivered
        Transactions &     │                               │ Notifications
        Transactional      │                               │
        Outbox             ▼                               ▼
                 ┌──────────────────┐            ┌──────────────────┐
                 │  PostgreSQL 18   │            │  Notifications   │
                 │ (Authoritative)  │            │   Table (UI)     │
                 │  localhost:5433  │            └────────▲─────────┘
                 └─────────┬────────┘                     │
                           │ Poll PENDING                 │ Idempotent ACK
                           ▼ Events                       │ & Insert
                 ┌──────────────────┐            ┌────────┴─────────┐
                 │  Outbox Worker   │            │   Notification   │
                 │    Publisher     │            │  Consumer Worker │
                 └─────────┬────────┘            └────────▲─────────┘
                           │                              │
                           │ Persistent Confirmed Pub     │ AMQP Manual ACK
                           ▼                              │
                 ┌────────────────────────────────────────┴─────────┐
                 │         RabbitMQ Broker (localhost:5672)         │
                 │   Topic Exchange: 'inventory.events'             │
                 │   Queues: 'stock-notifications', 'inventory-audit'│
                 │   Management UI: http://localhost:15672          │
                 └──────────────────────────────────────────────────┘
```

---

## 2. Low-Level Design (LLD) Business Rules

### Inventory Invariants
1. **Available Stock Calculation**:
   $$\text{Available Stock} = \text{On-Hand Stock} - \text{Reserved Stock}$$
2. **Low-Stock Detection Rule**:
   $$\text{Low Stock} \iff \text{Available Stock} \le \text{Reorder Level}$$
3. **Non-Negative Constraint**: On-hand stock cannot be negative ($\text{On-Hand} \ge 0$).
4. **Reservation Integrity**: Reserved stock cannot exceed on-hand stock ($0 \le \text{Reserved} \le \text{On-Hand}$).
5. **Audit Ledger**: Every successful inventory change creates an immutable `stock_movements` record.
6. **Transactional Outbox**: Stock mutations and outbox event records commit atomically inside the same database transaction.

### Inter-Warehouse Transfer State Machine
$$\text{CREATED (Reserved at Source)} \longrightarrow \text{DISPATCHED (Source Deducted)} \longrightarrow \text{IN\_TRANSIT} \longrightarrow \text{RECEIVED (Destination Incremented)}$$
- Rejects transfers where $\text{Source} = \text{Destination}$.
- Rejects transfers if $\text{Source Available Stock} < \text{Requested Quantity}$.
- Never allows a received transfer to be received again.

### Purchase Orders & Multi-Batch Receipts
$$\text{CREATED} \longrightarrow \text{APPROVED} \longrightarrow \text{PARTIALLY\_RECEIVED} \longrightarrow \text{RECEIVED}$$
- Rejects any receipt batch where $\text{Received Quantity} > \text{Remaining Ordered Quantity}$.
- Idempotent supplier updates: Duplicate supplier event IDs or idempotency keys are ignored or rejected without repeating stock increments.

---

## 3. Technology Stack

- **Frontend**: React 19, Vite, JavaScript, Custom Enterprise CSS Design System, Lucide Icons.
- **Backend**: Node.js v24, Express, `pg` (PostgreSQL client), `amqplib` (RabbitMQ AMQP client).
- **Authoritative Database**: PostgreSQL 18 running locally on port `5433` (`trust` authentication).
- **Message Broker**: Official RabbitMQ 4.3.6 standalone running on port `5672` (AMQP) with Management UI on port `15672`.
- **Erlang Runtime**: Portable Erlang OTP 29 with patched BEAM compiler compatibility.
- **Constraints Met**: Zero Docker containers, zero cloud dependencies, 100% localhost execution.

---

## 4. Local Service URLs

| Component | URL | Credentials / Notes |
|---|---|---|
| **Frontend Web App** | [http://localhost:5173](http://localhost:5173) | Vite Single-Page Application |
| **Backend REST API** | [http://localhost:5000/api/v1](http://localhost:5000/api/v1) | Express REST Service |
| **API Health Check** | [http://localhost:5000/api/v1/health](http://localhost:5000/api/v1/health) | Returns DB & RabbitMQ health |
| **RabbitMQ Management** | [http://localhost:15672](http://localhost:15672) | `guest` / `guest` |
| **PostgreSQL Database** | `localhost:5433` | User: `postgres`, DB: `postgres` |

---

## 5. One-Click Execution (Windows PowerShell)

To start the entire application suite with a single command:

```powershell
cd "c:\Users\mithilan\system design"
.\start-all.ps1
```

To stop all running services cleanly:

```powershell
cd "c:\Users\mithilan\system design"
.\stop-all.ps1
```

---

## 6. Manual Setup & Individual Commands

### Step 1: Database Setup
```powershell
# Start local PostgreSQL cluster on port 5433
& "C:\Program Files\PostgreSQL\18\bin\postgres.exe" -D "c:\Users\mithilan\system design\db\data" -p 5433

# Apply schema and initial demo seed
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5433 -U postgres -d postgres -f "sql/schema.sql"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5433 -U postgres -d postgres -f "sql/seed.sql"
```

### Step 2: RabbitMQ Broker Setup
```powershell
$env:ERLANG_HOME = "c:\Users\mithilan\system design\tools\erlang"
$env:PATH = "$env:ERLANG_HOME\bin;$env:PATH"
$env:RABBITMQ_BASE = "c:\Users\mithilan\system design\tools\rabbitmq\data"
& "c:\Users\mithilan\system design\tools\rabbitmq\rabbitmq_server-4.3.6\sbin\rabbitmq-server.bat"
```

### Step 3: Backend Server
```powershell
cd "c:\Users\mithilan\system design\backend"
npm install
npm start
```

### Step 4: Frontend Development Server
```powershell
cd "c:\Users\mithilan\system design\frontend"
npm install
npm run dev -- --host --port 5173
```

---

## 7. Automated Test Suite (12 Core Scenarios)

The project includes an automated test suite verifying all 12 core requirements specified in Section 9 of the design document:

```powershell
cd "c:\Users\mithilan\system design\backend"
npm test
```

### Test Coverage Results:
✔ **Scenario 1**: Create product and prevent duplicate SKU (`409 Conflict`).  
✔ **Scenario 2**: Receive stock against valid purchase order (`PARTIALLY_RECEIVED`).  
✔ **Scenario 3**: Reject receipt quantities exceeding remaining order quantity (`400 Bad Request`).  
✔ **Scenario 4**: Transfer stock between two warehouses (`CREATED -> DISPATCHED -> IN_TRANSIT -> RECEIVED`).  
✔ **Scenario 5**: Reject transfers with insufficient available stock (`409 Conflict`).  
✔ **Scenario 6**: Reject transfers where source equals destination (`400 Bad Request`).  
✔ **Scenario 7**: Prevent negative stock and duplicate receipts via idempotency key.  
✔ **Scenario 8**: Verify stock movements created for every stock change.  
✔ **Scenario 9**: Verify low-stock events create notifications in consumer queue.  
✔ **Scenario 10**: Verify repeated supplier event does not duplicate stock (idempotency).  
✔ **Scenario 11**: Failed database transaction leaves zero partial changes (atomic rollback).  
✔ **Scenario 12**: Transactional outbox processes pending events with broker confirms.  

---

## 8. College Demo Walkthrough Checklist

Follow this checklist to demonstrate the system to faculty:

1. **Dashboard & Initial Inventory Overview**:
   - Open `http://localhost:5173`.
   - Point out the KPI cards: Total Products, Warehouses, On-Hand, Available, and **Low Stock Alerts**.
   - Note the **Low Stock Card (1 alert)**: Keyboard in `WH02` has available stock of 10 units, which is $\le$ reorder level of 15.
   - Show the **Live RabbitMQ Notifications** card streaming events from the broker.

2. **RabbitMQ Management UI Verification**:
   - Open `http://localhost:15672` (`guest` / `guest`).
   - Navigate to **Exchanges**: Show the durable topic exchange `inventory.events`.
   - Navigate to **Queues**: Show `stock-notifications` and `inventory-audit`.
   - Show active message delivery rates.

3. **Product Management & Duplicate SKU Prevention**:
   - Navigate to **Products**.
   - Search for `LAP001` or `Mouse`.
   - Click **Add Product** and attempt to add a product with SKU `LAP001`.
   - Show the clean `409 Conflict` error: *"Product with SKU 'LAP001' already exists"*.
   - Add a new product (e.g., `MON001` - 27-inch 4K Monitor, Reorder level 5) and verify it appears.

4. **Inter-Warehouse Transfer State Machine**:
   - Navigate to **Transfers**.
   - Click **New Transfer**:
     - Attempt source `WH01` to destination `WH01`: notice instant rejection (*"Source and destination cannot be the same"*).
     - Select source `WH01`, destination `WH02`, product `Laptop (LAP001)`, quantity `5`.
     - Click **Create Transfer**.
   - Go to **Inventory**: Show that at `WH01`, Reserved stock increased by 5, and Available stock decreased from 50 to 45.
   - Return to **Transfers** and click **Dispatch**:
     - Status updates to `IN_TRANSIT`.
     - At `WH01`, On-Hand is deducted from 50 to 45, and Reserved is cleared.
     - Go to **Notifications**: Show the real-time event `amqp://transfer.dispatched` received from RabbitMQ!
   - Click **Confirm Receipt**:
     - Status updates to `RECEIVED`.
     - At `WH02`, Laptop On-Hand increases from 15 to 20!
     - Show the event `amqp://transfer.received` in Notifications.

5. **Purchase Order Multi-Batch Receiving**:
   - Navigate to **Purchase Orders**.
   - Show approved order `PO-2026-001`.
   - Click **Receive Goods**:
     - Attempt entering a quantity greater than remaining: notice the input validation barrier.
     - Receive a partial batch (e.g. 5 units).
     - Status updates to `PARTIALLY_RECEIVED`.
     - Show stock increment in warehouse `WH01`.

6. **Simulate Supplier Update (Idempotency)**:
   - On the Purchase Orders page, click **Simulate Supplier Update**.
   - Keep the generated Event ID and click **Simulate Supplier Dispatch**.
   - Show result: `PROCESSED` (+10 units added to inventory).
   - Click the button **a second time without changing the ID**.
   - Show result: `IGNORED_DUPLICATE` (*"Supplier update event already processed previously. Duplicate ignored idempotently"*).
   - Verify stock did not increase twice!

7. **Stock Movement Audit Ledger**:
   - Navigate to **Stock Movements**.
   - Show the comprehensive ledger with exact timestamps, previous vs new on-hand/reserved values, and reasons.
