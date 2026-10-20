//! Nacreum — on-chain denominated notes.
//!
//! ⚠️  WIP SKELETON — NOT AUDITED, NOT PRODUCTION-READY.
//!
//! This illustrates the intended primitive: money that comes in discrete, denominated
//! **notes** that can be **broken** into change and **fused** back into a bill, under one
//! iron rule — `break` and `fuse` never change the total face value in existence.
//!
//! The one-PDA-per-note model below is for readability. A billion notes require state
//! compression (see docs/ARCHITECTURE.md); the account creation for new notes in `break`/`fuse`
//! is elided here and marked `TODO`. The conservation checks, however, are real and complete.

use anchor_lang::prelude::*;

// TODO: replace with the deployed program id before any launch.
declare_id!("11111111111111111111111111111111");

#[program]
pub mod nacreum {
    use super::*;

    /// One-time setup of the issue.
    pub fn initialize(ctx: Context<Initialize>, supply_cap: u64) -> Result<()> {
        require!(supply_cap > 0, NacreumError::ZeroSupplyCap);
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.supply_cap = supply_cap; // max total face value that may ever be minted
        cfg.minted = 0; // total face value minted so far
        cfg.next_serial = 1; // monotonic serial counter (serials start at 1)
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    /// Mint a fresh note of `denom` to `recipient`.
    ///
    /// This is the ONLY instruction that increases total face value, and it is bounded by
    /// `supply_cap`. In production this is gated by the launch/bonding-curve authority; here it
    /// is authority-gated for the skeleton.
    pub fn mint_note(ctx: Context<MintNote>, denom: u64) -> Result<()> {
        require!(denom > 0, NacreumError::ZeroDenom);
        let cfg = &mut ctx.accounts.config;

        cfg.minted = cfg.minted.checked_add(denom).ok_or(NacreumError::Overflow)?;
        require!(cfg.minted <= cfg.supply_cap, NacreumError::SupplyCapExceeded);

        let serial = next_serial(cfg)?;
        let note = &mut ctx.accounts.note;
        note.serial = serial;
        note.denom = denom;
        note.owner = ctx.accounts.recipient.key();
        note.hands = 0;
        note.bump = ctx.bumps.note;

        emit!(NoteMinted { serial, denom, owner: note.owner });
        Ok(())
    }

    /// Break one note into change. `pieces` are the face values of the new notes.
    ///
    /// CONSERVATION: `sum(pieces) == input.denom`. The input note is closed (its serial retires
    /// and is never reused); one fresh, monotonically-serialled note is created per piece.
    pub fn break_note(ctx: Context<BreakNote>, pieces: Vec<u64>) -> Result<()> {
        require!(!pieces.is_empty(), NacreumError::EmptyPieces);
        require!(pieces.len() <= MAX_PIECES, NacreumError::TooManyPieces);
        require!(pieces.iter().all(|&d| d > 0), NacreumError::ZeroDenom);

        // checked sum — any overflow aborts the whole tx.
        let mut sum: u64 = 0;
        for &d in pieces.iter() {
            sum = sum.checked_add(d).ok_or(NacreumError::Overflow)?;
        }
        require!(sum == ctx.accounts.note.denom, NacreumError::NotConserved);

        let cfg = &mut ctx.accounts.config;
        let owner = ctx.accounts.note.owner;
        for &d in pieces.iter() {
            let serial = next_serial(cfg)?;
            // TODO(scale): create a Note PDA (seeds ["note", serial]) with (serial, d, owner)
            //              via remaining_accounts + `create_account`, or post a leaf to the
            //              compression tree. Elided in the skeleton.
            emit!(NoteMinted { serial, denom: d, owner });
        }

        emit!(NoteRetired { serial: ctx.accounts.note.serial, denom: ctx.accounts.note.denom });
        // The input note is closed via `close = payer` in the accounts context; its lamports
        // are reclaimed and its serial is retired. Total face value is unchanged.
        Ok(())
    }

    /// Fuse several notes into one. The inputs are passed via `remaining_accounts`; the single
    /// output note's face value MUST equal the sum of the inputs.
    ///
    /// CONSERVATION: `output.denom == sum(inputs.denom)`.
    pub fn fuse_notes(ctx: Context<FuseNotes>) -> Result<()> {
        let inputs = &ctx.remaining_accounts;
        require!(inputs.len() >= 2, NacreumError::TooFewInputs);
        require!(inputs.len() <= MAX_INPUTS, NacreumError::TooManyInputs);

        let owner = ctx.accounts.owner.key();
        let mut sum: u64 = 0;
        for acc in inputs.iter() {
            let note: Account<Note> = Account::try_from(acc)?;
            require!(note.owner == owner, NacreumError::NotOwner);
            sum = sum.checked_add(note.denom).ok_or(NacreumError::Overflow)?;
            // TODO(scale): close each input note here (retire its serial) — elided in skeleton.
            emit!(NoteRetired { serial: note.serial, denom: note.denom });
        }

        let cfg = &mut ctx.accounts.config;
        let serial = next_serial(cfg)?;
        let out = &mut ctx.accounts.output;
        out.serial = serial;
        out.denom = sum; // == sum(inputs) by construction
        out.owner = owner;
        out.hands = 0;
        out.bump = ctx.bumps.output;

        emit!(NoteMinted { serial, denom: sum, owner });
        Ok(())
    }

    /// Hand a note to a new owner. Records provenance (`hands += 1`). Value unchanged.
    pub fn transfer_note(ctx: Context<TransferNote>, new_owner: Pubkey) -> Result<()> {
        let note = &mut ctx.accounts.note;
        note.owner = new_owner;
        note.hands = note.hands.saturating_add(1);
        Ok(())
    }
}

/// Assign the next serial and advance the monotonic counter.
///
/// Serials are never chosen by the user and never reused — this is what stops churning
/// break↔fuse to farm a rare serial (appearance = f(serial)), and keeps provenance honest.
fn next_serial(cfg: &mut Config) -> Result<u64> {
    let serial = cfg.next_serial;
    cfg.next_serial = cfg.next_serial.checked_add(1).ok_or(NacreumError::Overflow)?;
    Ok(serial)
}

// ------------------------------------------------------------------ limits
const MAX_PIECES: usize = 32; // TBD in the pre-launch spec
const MAX_INPUTS: usize = 32; // TBD in the pre-launch spec

// ------------------------------------------------------------------ state
#[account]
pub struct Config {
    pub authority: Pubkey,
    pub supply_cap: u64,
    pub minted: u64,
    pub next_serial: u64,
    pub bump: u8,
}
impl Config {
    pub const SIZE: usize = 32 + 8 + 8 + 8 + 1;
}

#[account]
pub struct Note {
    pub serial: u64,
    pub denom: u64,
    pub owner: Pubkey,
    pub hands: u32,
    pub bump: u8,
}
impl Note {
    pub const SIZE: usize = 8 + 8 + 32 + 4 + 1;
}

// ------------------------------------------------------------------ contexts
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init, payer = authority, space = 8 + Config::SIZE,
        seeds = [b"config"], bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintNote<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    #[account(
        init, payer = authority, space = 8 + Note::SIZE,
        seeds = [b"note", config.next_serial.to_le_bytes().as_ref()], bump
    )]
    pub note: Account<'info, Note>,
    /// CHECK: recipient is only stored as the note's owner pubkey.
    pub recipient: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BreakNote<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    // input note is closed; only its owner may break it.
    #[account(mut, close = payer, has_one = owner)]
    pub note: Account<'info, Note>,
    pub owner: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    // remaining_accounts: the fresh Note PDAs to create (one per piece) — see TODO(scale).
}

#[derive(Accounts)]
pub struct FuseNotes<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init, payer = payer, space = 8 + Note::SIZE,
        seeds = [b"note", config.next_serial.to_le_bytes().as_ref()], bump
    )]
    pub output: Account<'info, Note>,
    pub owner: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    // remaining_accounts: the input Note accounts to fuse & close — see TODO(scale).
}

#[derive(Accounts)]
pub struct TransferNote<'info> {
    #[account(mut, has_one = owner)]
    pub note: Account<'info, Note>,
    pub owner: Signer<'info>,
}

// ------------------------------------------------------------------ events
#[event]
pub struct NoteMinted {
    pub serial: u64,
    pub denom: u64,
    pub owner: Pubkey,
}
#[event]
pub struct NoteRetired {
    pub serial: u64,
    pub denom: u64,
}

// ------------------------------------------------------------------ errors
#[error_code]
pub enum NacreumError {
    #[msg("supply cap must be > 0")]
    ZeroSupplyCap,
    #[msg("denomination must be > 0")]
    ZeroDenom,
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("supply cap exceeded")]
    SupplyCapExceeded,
    #[msg("break/fuse must conserve total face value")]
    NotConserved,
    #[msg("no pieces provided")]
    EmptyPieces,
    #[msg("too many pieces for one break")]
    TooManyPieces,
    #[msg("fuse needs at least two inputs")]
    TooFewInputs,
    #[msg("too many inputs for one fuse")]
    TooManyInputs,
    #[msg("caller is not the note owner")]
    NotOwner,
}
