// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IDontGhostMe
/// @notice ABI-compatible interface for the Don't Ghost Me MVP contract.
interface IDontGhostMe {
    enum ProjectStatus {
        Active,
        Finished,
        Cancelled
    }

    enum BountyStatus {
        Open,
        Claimed,
        Submitted,
        RevisionRequested,
        Approved,
        Rejected,
        Paid,
        Cancelled
    }

    struct Project {
        uint256 id;
        address owner;
        string name;
        uint256 depositAmount;
        uint256 rescuePool;
        uint256 reservedBounty;
        ProjectStatus status;
    }

    struct Member {
        address account;
        uint256 deposit;
        bool active;
        bool withdrawn;
    }

    struct Bounty {
        uint256 id;
        uint256 projectId;
        string description;
        uint256 reward;
        address creator;
        address hunter;
        BountyStatus status;
        uint256 statusUpdatedAt;
        string reviewReason;
    }

    struct ExpulsionProposal {
        uint256 id;
        uint256 projectId;
        address target;
        address proposer;
        uint256 approveVotes;
        uint256 rejectVotes;
        uint256 deadline;
        uint256 bondAmount;
        bool executed;
        string reason;
    }

    struct RescuePoolSettlement {
        uint256 totalAmount;
        uint256 remainingAmount;
        uint256 eligibleMembers;
        uint256 claimedMembers;
        uint256 claimDeadline;
        bool initialized;
    }

    event ProjectCreated(uint256 indexed projectId, address indexed owner, string name, uint256 depositAmount);
    event ProjectFinished(uint256 indexed projectId);
    event ProjectCancelled(uint256 indexed projectId);
    event MemberJoined(uint256 indexed projectId, address indexed member, uint256 deposit);
    event MemberLeft(uint256 indexed projectId, address indexed member, uint256 forfeitedDeposit);
    event DepositWithdrawn(uint256 indexed projectId, address indexed member, uint256 amount);
    event BountyCreated(
        uint256 indexed bountyId, uint256 indexed projectId, address indexed creator, string description, uint256 reward
    );
    event BountyClaimed(uint256 indexed bountyId, address indexed hunter);
    event BountyClaimCancelled(uint256 indexed bountyId, address indexed hunter);
    event WorkSubmitted(uint256 indexed bountyId, address indexed hunter);
    event RevisionRequested(uint256 indexed bountyId, address indexed reviewer, string reason);
    event BountyApproved(uint256 indexed bountyId, address indexed reviewer);
    event BountyRejected(uint256 indexed bountyId, address indexed reviewer, string reason);
    event BountyPaid(uint256 indexed bountyId, address indexed hunter, uint256 reward);
    event BountyCancelled(uint256 indexed bountyId, uint256 indexed projectId, uint256 releasedReward, string reason);
    event ExpulsionProposed(
        uint256 indexed proposalId,
        uint256 indexed projectId,
        address indexed proposer,
        address target,
        uint256 bondAmount
    );
    event ExpulsionReasonRecorded(uint256 indexed proposalId, string reason);
    event ExpulsionVoted(uint256 indexed proposalId, address indexed voter, bool support);
    event MemberExpelled(uint256 indexed projectId, address indexed member, uint256 forfeitedDeposit);
    event ExpulsionFinalized(uint256 indexed proposalId, bool passed, uint256 refundedBond, uint256 slashedBond);
    event ExpulsionBondWithdrawn(address indexed proposer, uint256 amount);
    event ExpulsionLimitExtended(uint256 indexed projectId, uint256 additionalLimit, uint256 newLimit);
    event RescuePoolSettlementCreated(
        uint256 indexed projectId, uint256 totalAmount, uint256 eligibleMembers, uint256 claimDeadline
    );
    event RescuePoolWithdrawn(uint256 indexed projectId, address indexed member, uint256 amount);
    event UnclaimedRescuePoolSwept(uint256 indexed projectId, address indexed owner, uint256 amount);

    error ExpulsionProposalNotFound();
    error ProjectHasOpenExpulsions();
    error OnlyActiveMember();
    error CannotExpelSelf();
    error CannotVoteAsExpulsionTarget();
    error TargetNotActive();
    error InsufficientActiveMembers();
    error TargetHasOpenProposal();
    error ProposerHasOpenProposal();
    error ExpulsionAlreadyExecuted();
    error ExpulsionVotingEnded();
    error ExpulsionVotingActive();
    error ExpulsionAlreadyVoted();
    error ExpulsionCooldownActive();
    error ExpulsionProposalLimitReached();
    error IncorrectExpulsionBond(uint256 expected, uint256 received);
    error NoExpulsionBondRefund();
    error OnlyProtocolAdmin();
    error InvalidBountyTransition();
    error EmptyReviewReason();
    error EmptyExpulsionReason();
    error BountyReviewPeriodActive();
    error BountyClaimPeriodActive();
    error RescuePoolSettlementUnavailable();
    error NotRescuePoolBeneficiary();
    error RescuePoolAlreadyWithdrawn();
    error RescuePoolClaimPeriodEnded();
    error RescuePoolClaimPeriodActive();
    error NoRescuePoolBalance();

    function EXPULSION_VOTING_PERIOD() external view returns (uint256);

    function EXPULSION_COOLDOWN() external view returns (uint256);

    function DEFAULT_MAX_EXPULSION_PROPOSALS() external view returns (uint256);

    function EXPULSION_BOND_BPS() external view returns (uint256);

    function FAILED_EXPULSION_SLASH_BPS() external view returns (uint256);

    function BPS_DENOMINATOR() external view returns (uint256);

    function BOUNTY_REVIEW_PERIOD() external view returns (uint256);

    function BOUNTY_CLAIM_PERIOD() external view returns (uint256);

    function RESCUE_POOL_CLAIM_PERIOD() external view returns (uint256);

    function nextProjectId() external view returns (uint256);

    function nextBountyId() external view returns (uint256);

    function nextExpulsionId() external view returns (uint256);

    function protocolAdmin() external view returns (address);

    function createProject(string calldata name, uint256 depositAmount) external returns (uint256 projectId);

    function finishProject(uint256 projectId) external;

    function cancelProject(uint256 projectId) external;

    function joinProject(uint256 projectId) external payable;

    function leaveProject(uint256 projectId) external;

    function leaveAndCreateRescueBounty(uint256 projectId, string calldata description)
        external
        returns (uint256 bountyId);

    function withdrawDeposit(uint256 projectId) external;

    function createBounty(uint256 projectId, string calldata description, uint256 reward)
        external
        returns (uint256 bountyId);

    function claimBounty(uint256 bountyId) external;

    function cancelClaim(uint256 bountyId) external;

    function submitWork(uint256 bountyId) external;

    function requestRevision(uint256 bountyId, string calldata reason) external;

    function rejectWork(uint256 bountyId, string calldata reason) external;

    function approveWork(uint256 bountyId) external;

    function cancelBounty(uint256 bountyId) external;

    function cancelSubmittedBounty(uint256 bountyId, string calldata reason) external;

    function cancelStaleBounty(uint256 bountyId) external;

    function proposeExpulsion(uint256 projectId, address target) external payable returns (uint256 proposalId);
    function proposeExpulsionWithReason(uint256 projectId, address target, string calldata reason)
        external
        payable
        returns (uint256 proposalId);

    function approveAdditionalExpulsions(uint256 projectId, uint256 additionalLimit) external;

    function voteExpulsion(uint256 proposalId, bool support) external;

    function executeExpulsion(uint256 proposalId) external;

    function withdrawExpulsionBondRefund() external;

    function withdrawRemainingRescuePool(uint256 projectId) external;

    function sweepUnclaimedRescuePool(uint256 projectId) external;

    function getProject(uint256 projectId) external view returns (Project memory);

    function getMember(uint256 projectId, address account) external view returns (Member memory);

    function getBounty(uint256 bountyId) external view returns (Bounty memory);

    function getExpulsionProposal(uint256 proposalId) external view returns (ExpulsionProposal memory);
    function getActiveExpulsionProposalByTarget(uint256 projectId, address target) external view returns (uint256);
    function getActiveExpulsionProposalByProposer(uint256 projectId, address proposer) external view returns (uint256);

    function hasVoted(uint256 proposalId, address voter) external view returns (bool);

    function getRequiredExpulsionBond(uint256 projectId) external view returns (uint256);

    function getExpulsionProposalCount(uint256 projectId) external view returns (uint256);

    function getExpulsionProposalLimit(uint256 projectId) external view returns (uint256);

    function getPendingExpulsionBondRefund(address proposer) external view returns (uint256);

    function getActiveMemberCount(uint256 projectId) external view returns (uint256);

    function getProjectMembers(uint256 projectId) external view returns (address[] memory);

    function getRescuePoolSettlement(uint256 projectId) external view returns (RescuePoolSettlement memory);

    function hasWithdrawnRemainingRescuePool(uint256 projectId, address member) external view returns (bool);

    function getAvailableRescuePool(uint256 projectId) external view returns (uint256);
}
