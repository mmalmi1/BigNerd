docker build -t frontend .
docker run -p 443:443 -p 80:80 --network=host frontend
