from fastapi.testclient import TestClient
from server.api import app

c = TestClient(app)
r = c.post('/api/optimize', json={'symbol':'BNB','regime':'trending_up','limit':200})
print(f'Status: {r.status_code}')
d = r.json()
print(f'Result: {d["status"]} after {d["iteration"]}/{d["total_iterations"]} iterations')
print(f'Attempts: {len(d["all_attempts"])}')
print(f'Best: {d["strategy_name"]} exp={d["expectancy_pct"]:.2f}%')
