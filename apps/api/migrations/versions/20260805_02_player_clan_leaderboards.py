"""add shared players, presence, sessions, and leaderboards

Revision ID: 20260805_02
Revises: 20260802_01
Create Date: 2026-08-05
"""

import sqlalchemy as sa
from alembic import op

revision = "20260805_02"
down_revision = "20260802_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(length=32), nullable=False, server_default="member"))
    op.add_column("users", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_users_last_seen_at", "users", ["last_seen_at"])
    op.execute("UPDATE users SET role = 'overlord' WHERE is_admin = TRUE")

    op.create_table(
        "player_profiles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("nickname", sa.String(length=9), nullable=False),
        sa.Column("haircut", sa.String(length=32), nullable=False),
        sa.Column("hair_color", sa.String(length=16), nullable=False),
        sa.Column("tshirt_color", sa.String(length=16), nullable=False),
        sa.Column("pants_color", sa.String(length=16), nullable=False),
        sa.Column("shoe_color", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "length(nickname) >= 1 AND length(nickname) < 10",
            name="ck_player_profiles_nickname_length",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_player_profiles_user_id"),
    )
    op.create_index("ix_player_profiles_user_id", "player_profiles", ["user_id"])

    op.create_table(
        "game_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("game_id", sa.Uuid(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("credited_playtime_seconds", sa.Float(), nullable=False),
        sa.CheckConstraint(
            "credited_playtime_seconds >= 0",
            name="ck_game_sessions_credited_playtime_nonnegative",
        ),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_game_sessions_user_id", "game_sessions", ["user_id"])
    op.create_index("ix_game_sessions_game_id", "game_sessions", ["game_id"])
    op.create_index("ix_game_sessions_user_game", "game_sessions", ["user_id", "game_id"])
    op.create_index("ix_game_sessions_last_heartbeat", "game_sessions", ["last_heartbeat_at"])

    op.create_table(
        "leaderboard_definitions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("game_id", sa.Uuid(), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("display_name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=False),
        sa.Column("mission_key", sa.String(length=100), nullable=True),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("sort_direction", sa.String(length=12), nullable=False),
        sa.Column("aggregation", sa.String(length=16), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "sort_direction IN ('asc', 'desc', 'ascending', 'descending')",
            name="ck_leaderboard_definitions_sort_direction",
        ),
        sa.CheckConstraint(
            "aggregation IN ('max', 'min', 'latest', 'sum', 'best_maximum', 'best_minimum', 'cumulative_sum')",
            name="ck_leaderboard_definitions_aggregation",
        ),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("game_id", "key", name="uq_leaderboard_definitions_game_key"),
    )
    op.create_index("ix_leaderboard_definitions_game_id", "leaderboard_definitions", ["game_id"])
    op.create_index(
        "ix_leaderboard_definitions_game_key",
        "leaderboard_definitions",
        ["game_id", "key"],
    )

    op.create_table(
        "leaderboard_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("leaderboard_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("achieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["leaderboard_id"], ["leaderboard_definitions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("leaderboard_id", "user_id", name="uq_leaderboard_entries_definition_user"),
    )
    op.create_index("ix_leaderboard_entries_leaderboard_id", "leaderboard_entries", ["leaderboard_id"])
    op.create_index("ix_leaderboard_entries_user_id", "leaderboard_entries", ["user_id"])
    op.create_index(
        "ix_leaderboard_entries_definition_value",
        "leaderboard_entries",
        ["leaderboard_id", "value"],
    )
    op.create_index(
        "ix_leaderboard_entries_definition_user",
        "leaderboard_entries",
        ["leaderboard_id", "user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_leaderboard_entries_definition_user", table_name="leaderboard_entries")
    op.drop_index("ix_leaderboard_entries_definition_value", table_name="leaderboard_entries")
    op.drop_index("ix_leaderboard_entries_user_id", table_name="leaderboard_entries")
    op.drop_index("ix_leaderboard_entries_leaderboard_id", table_name="leaderboard_entries")
    op.drop_table("leaderboard_entries")

    op.drop_index("ix_leaderboard_definitions_game_key", table_name="leaderboard_definitions")
    op.drop_index("ix_leaderboard_definitions_game_id", table_name="leaderboard_definitions")
    op.drop_table("leaderboard_definitions")

    op.drop_index("ix_game_sessions_last_heartbeat", table_name="game_sessions")
    op.drop_index("ix_game_sessions_user_game", table_name="game_sessions")
    op.drop_index("ix_game_sessions_game_id", table_name="game_sessions")
    op.drop_index("ix_game_sessions_user_id", table_name="game_sessions")
    op.drop_table("game_sessions")

    op.drop_index("ix_player_profiles_user_id", table_name="player_profiles")
    op.drop_table("player_profiles")

    op.drop_index("ix_users_last_seen_at", table_name="users")
    op.drop_column("users", "last_seen_at")
    op.drop_column("users", "role")
