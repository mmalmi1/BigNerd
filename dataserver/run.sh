docker build -t dataserver .
docker run -d -p 5000:5000 -v $(pwd)/sqlite3:/sqlite3 dataserver
