use anchor_lang::prelude::*;

#[error_code]
pub enum BreakError {
    #[msg("Only the protocol admin can do this")]
    NotAdmin,
    #[msg("Only the host can do this")]
    NotHost,
    #[msg("Wrong account")]
    BadAccount,
    #[msg("A break needs 2-16 spots and 1-8 cards per spot")]
    BadShape,
    #[msg("Spot price is below the minimum")]
    PriceTooLow,
    #[msg("This card has not been appraised")]
    NotAppraised,
    #[msg("That token is not a card NFT (supply 1, 0 decimals)")]
    NotACard,
    #[msg("That card slot is already filled")]
    SlotFilled,
    #[msg("Not every card is in the vault yet")]
    BoxIncomplete,
    #[msg("The break is not in the right stage for this")]
    WrongStage,
    #[msg("That spot is taken")]
    SpotTaken,
    #[msg("No such spot")]
    BadSpot,
    #[msg("You don't own this spot")]
    NotSpotOwner,
    #[msg("This spot's pack is already opening")]
    SpotLocked,
    #[msg("Not listed")]
    NotListed,
    #[msg("Price changed: refresh and try again")]
    PriceMoved,
    #[msg("Bid too low: beat the standing bid by at least 1%")]
    BidTooLow,
    #[msg("No bid on this spot")]
    NoBid,
    #[msg("You can't trade with yourself")]
    SelfTrade,
    #[msg("Not enough USDC approved for this session")]
    NotApproved,
    #[msg("Too early")]
    TooEarly,
    #[msg("Every card is already out")]
    AllRevealed,
    #[msg("The shuffle hasn't landed yet")]
    NotShuffled,
    #[msg("Card already delivered")]
    AlreadyClaimed,
    #[msg("Faucet cooling down")]
    FaucetCooldown,
    #[msg("Math overflow")]
    Overflow,
    #[msg("Break must run on the TEE validator")]
    NotTee,
    #[msg("Host needs a private USDC balance first (make any deposit)")]
    HostNotReady,
    #[msg("Payment instructions missing in front of this one")]
    PaymentMissing,
    #[msg("Payment doesn't match: wrong payer, payee or amount")]
    PaymentMismatch,
    #[msg("This spot is reserved for another buyer for a few seconds")]
    Reserved,
    #[msg("This key can't act for that profile")]
    NotYourProfile,
    #[msg("Name must be 2-20 letters, numbers, _ or -")]
    BadName,
    #[msg("The VRF request failed")]
    VrfRequestFailed,
    #[msg("Scheduling the reveal crank failed")]
    CrankFailed,
}
