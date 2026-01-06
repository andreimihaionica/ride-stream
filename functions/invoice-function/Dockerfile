FROM ghcr.io/openfaas/classic-watchdog:0.2.1 as watchdog
FROM python:3.9-slim
COPY --from=watchdog /fwatchdog /usr/bin/fwatchdog
RUN chmod +x /usr/bin/fwatchdog
WORKDIR /app
COPY handler.py .
ENV fprocess="python handler.py"
EXPOSE 8080
CMD ["fwatchdog"]