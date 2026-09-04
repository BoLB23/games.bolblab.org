import argparse

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.seed import seed_database


def main() -> None:
    parser = argparse.ArgumentParser(description="Game platform API maintenance commands")
    parser.add_argument("command", choices=["seed"])
    parser.add_argument(
        "--production",
        action="store_true",
        help="Upsert only catalog and leaderboard definitions; never create development fixture users or scores.",
    )
    args = parser.parse_args()
    if args.command == "seed":
        settings = get_settings()
        with SessionLocal() as session:
            seed_database(
                session,
                settings.sample_game_launch_url or settings.sample_game_origin,
                flappy_mike_origin=settings.flappy_mike_launch_url or settings.flappy_mike_origin,
                milton_estates_origin=settings.milton_estates_origin,
                milton_estates_launch_url=settings.milton_estates_launch_url,
                milton_estates_enabled=settings.milton_estates_enabled,
                milton_estates_cloud_saves_enabled=settings.milton_estates_cloud_saves_enabled,
                disc_golf_with_friends_origin=settings.disc_golf_with_friends_origin,
                disc_golf_with_friends_launch_url=settings.disc_golf_with_friends_launch_url,
                disc_golf_with_friends_enabled=settings.disc_golf_with_friends_enabled,
                include_development_data=not args.production,
            )
        print("Seed data is up to date.")


if __name__ == "__main__":
    main()
