FROM postgres:16-alpine

COPY init.sql /docker-entrypoint-initdb.d/init.sql
RUN chmod 0644 /docker-entrypoint-initdb.d/init.sql
