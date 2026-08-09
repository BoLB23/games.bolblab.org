"""add OIDC login transactions and revocable user sessions

Revision ID: 20260807_04
Revises: 20260806_03
Create Date: 2026-08-07
"""

import sqlalchemy as sa
from alembic import op

revision = "20260807_04"
down_revision = "20260806_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "oidc_login_transactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("state_digest", sa.String(length=64), nullable=False),
        sa.Column("nonce", sa.String(length=256), nullable=False),
        sa.Column("encrypted_code_verifier", sa.String(length=512), nullable=False),
        sa.Column("return_path", sa.String(length=2048), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("state_digest"),
    )
    op.create_index("ix_oidc_login_transactions_state_digest", "oidc_login_transactions", ["state_digest"])
    op.create_index("ix_oidc_login_transactions_expires_at", "oidc_login_transactions", ["expires_at"])
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("token_digest", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_digest"),
    )
    op.create_index("ix_user_sessions_token_digest", "user_sessions", ["token_digest"])
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_expires_at", "user_sessions", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_user_sessions_expires_at", table_name="user_sessions")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_index("ix_user_sessions_token_digest", table_name="user_sessions")
    op.drop_table("user_sessions")
    op.drop_index("ix_oidc_login_transactions_expires_at", table_name="oidc_login_transactions")
    op.drop_index("ix_oidc_login_transactions_state_digest", table_name="oidc_login_transactions")
    op.drop_table("oidc_login_transactions")
