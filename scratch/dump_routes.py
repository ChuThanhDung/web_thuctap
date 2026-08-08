import json

from src.main import app

routes = []
for route in app.routes:
    routes.append(getattr(route, "path", str(route)))

with open("scratch/debug_routes.json", "w") as f:
    json.dump(routes, f)
