"""add versioned cloud saves

Revision ID: 20260806_03
Revises: 20260805_02
Create Date: 2026-08-06
"""

import sqlalchemy as sa
from alembic import op

revision = "20260806_03"
down_revision = "20260805_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "player_game_profiles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("game_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "game_id", name="uq_player_game_profiles_user_game"),
    )
    op.create_index("ix_player_game_profiles_user_id", "player_game_profiles", ["user_id"])
    op.create_index("ix_player_game_profiles_game_id", "player_game_profiles", ["game_id"])

    op.create_table(
        "game_saves",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("profile_id", sa.Uuid(), nullable=False),
        sa.Column("slot_key", sa.String(length=100), nullable=False),
        sa.Column("game_version", sa.String(length=64), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("data_json", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("revision >= 1", name="ck_game_saves_revision_positive"),
        sa.CheckConstraint("schema_version >= 1", name="ck_game_saves_schema_version_positive"),
        sa.CheckConstraint("byte_size >= 0", name="ck_game_saves_byte_size_nonnegative"),
        sa.ForeignKeyConstraint(["profile_id"], ["player_game_profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("profile_id", "slot_key", name="uq_game_saves_profile_slot"),
    )
    op.create_index("ix_game_saves_profile_id", "game_saves", ["profile_id"])
    op.create_index("ix_game_saves_profile_updated", "game_saves", ["profile_id", "updated_at"])


def downgrade() -> None:
    op.drop_index("ix_game_saves_profile_updated", table_name="game_saves")
    op.drop_index("ix_game_saves_profile_id", table_name="game_saves")
    op.drop_table("game_saves")
    op.drop_index("ix_player_game_profiles_game_id", table_name="player_game_profiles")
    op.drop_index("ix_player_game_profiles_user_id", table_name="player_game_profiles")
    op.drop_table("player_game_profiles")
