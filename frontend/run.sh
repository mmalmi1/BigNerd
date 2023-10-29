docker build -t frontend .
docker run -d -p 8754:8754 -p 443:443 -p 80:80 --network=host frontend
