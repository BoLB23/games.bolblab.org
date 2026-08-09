"""add OIDC verification and explicit player onboarding state

Revision ID: 20260809_05
Revises: 20260807_04
Create Date: 2026-08-09
"""

import sqlalchemy as sa
from alembic import op

revision = "20260809_05"
down_revision = "20260807_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_verified", sa.Boolean(), nullable=True))
    op.add_column("users", sa.Column("player_setup_completed_at", sa.DateTime(timezone=True), nullable=True))
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("role", existing_type=sa.String(length=32), server_default="peon")
    # All users predate onboarding, including any legacy account that has not
    # opened the player editor yet.  Preserve those accounts as complete.
    op.execute("UPDATE users SET player_setup_completed_at = CURRENT_TIMESTAMP")


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("role", existing_type=sa.String(length=32), server_default="member")
    op.drop_column("users", "player_setup_completed_at")
    op.drop_column("users", "email_verified")
