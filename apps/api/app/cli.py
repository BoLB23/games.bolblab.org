import argparse

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.seed import seed_database


def main() -> None:
    parser = argparse.ArgumentParser(description="Game platform API maintenance commands")
    parser.add_argument("command", choices=["seed"])
    args = parser.parse_args()
    if args.command == "seed":
        settings = get_settings()
        with SessionLocal() as session:
            seed_database(
                session,
                settings.sample_game_launch_url or settings.sample_game_origin,
                flappy_mike_origin=settings.flappy_mike_launch_url or settings.flappy_mike_origin,
                milton_estates_origin=settings.milton_estates_origin,
                milton_estates_enabled=settings.milton_estates_enabled,
                milton_estates_cloud_saves_enabled=settings.milton_estates_cloud_saves_enabled,
            )
        print("Seed data is up to date.")


if __name__ == "__main__":
    main()
