FROM ghcr.io/ulyssesleolee/catest-ai-base:latest

EXPOSE 34081
CMD ["uvicorn", "catest_ai.tm.app:app", "--host", "0.0.0.0", "--port", "34081"]
