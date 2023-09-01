import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from tortoise.contrib.fastapi import register_tortoise


app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_tortoise(
    app,
    db_url="mysql://docker:docker@127.0.0.1:3306/docker",
    modules={"models": ["models"]},
    generate_schemas=True,
    add_exception_handlers=True,
)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)