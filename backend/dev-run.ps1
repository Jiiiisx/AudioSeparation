# Quick-start backend via Docker (lingkungan yang sama dengan deploy Render)
docker rm -f riemann-api 2>/dev/null || true
docker run -d --name riemann-api -p 8000:8000 -v "riemann-jobs:/app/cache" riemann-api
echo ""
echo "Tunggu ~10s, lalu check:"
start http://localhost:8000/api/health
