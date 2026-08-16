"""add durable leaderboard submission idempotency keys

Revision ID: 20260816_06
Revises: 20260809_05
Create Date: 2026-08-16
"""

import sqlalchemy as sa
from alembic import op

revision = "20260816_06"
down_revision = "20260809_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "leaderboard_submissions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("leaderboard_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["leaderboard_id"], ["leaderboard_definitions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("leaderboard_id", "user_id", "idempotency_key", name="uq_leaderboard_submissions_key"),
    )
    op.create_index("ix_leaderboard_submissions_leaderboard_id", "leaderboard_submissions", ["leaderboard_id"])
    op.create_index("ix_leaderboard_submissions_user_id", "leaderboard_submissions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_leaderboard_submissions_user_id", table_name="leaderboard_submissions")
    op.drop_index("ix_leaderboard_submissions_leaderboard_id", table_name="leaderboard_submissions")
    op.drop_table("leaderboard_submissions")
