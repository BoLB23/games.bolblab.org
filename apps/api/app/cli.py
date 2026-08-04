import argparse

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.seed import seed_database


def main() -> None:
    parser = argparse.ArgumentParser(description="Game platform API maintenance commands")
    parser.add_argument("command", choices=["seed"])
    args = parser.parse_args()
    if args.command == "seed":
        with SessionLocal() as session:
            seed_database(session, get_settings().sample_game_origin)
        print("Seed data is up to date.")


if __name__ == "__main__":
    main()
