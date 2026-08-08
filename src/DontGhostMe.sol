// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Don't Ghost Me
/// @notice An MVP escrow and rescue bounty system for collaborative projects.
/// @dev Deposits and bounty rewards use the native token (MON on Monad).
contract DontGhostMe {
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

    uint256 public constant EXPULSION_VOTING_PERIOD = 3 days;
    uint256 public constant EXPULSION_COOLDOWN = 1 days;
    uint256 public constant DEFAULT_MAX_EXPULSION_PROPOSALS = 10;
    uint256 public constant EXPULSION_BOND_BPS = 1_000;
    uint256 public constant FAILED_EXPULSION_SLASH_BPS = 5_000;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant BOUNTY_REVIEW_PERIOD = 3 days;
    uint256 public constant BOUNTY_CLAIM_PERIOD = 7 days;
    uint256 public constant RESCUE_POOL_CLAIM_PERIOD = 30 days;

    uint256 public nextProjectId = 1;
    uint256 public nextBountyId = 1;
    uint256 public nextExpulsionId = 1;
    address public immutable protocolAdmin;

    mapping(uint256 projectId => Project project) private _projects;
    mapping(uint256 projectId => mapping(address account => Member member)) private _members;
    mapping(uint256 projectId => address[] members) private _projectMembers;
    mapping(uint256 bountyId => Bounty bounty) private _bounties;
    mapping(uint256 proposalId => ExpulsionProposal proposal) private _expulsionProposals;
    mapping(uint256 proposalId => mapping(address voter => bool)) private _expulsionVoted;

    mapping(uint256 projectId => uint256 count) private _activeMemberCounts;
    mapping(uint256 projectId => mapping(address target => uint256 proposalId)) private _activeExpulsionByTarget;
    mapping(uint256 projectId => mapping(address proposer => uint256 proposalId)) private _activeExpulsionByProposer;
    mapping(uint256 projectId => uint256 count) private _openExpulsionCounts;
    mapping(uint256 projectId => uint256 count) private _expulsionProposalCounts;
    mapping(uint256 projectId => uint256 additionalLimit) private _expulsionLimitExtensions;
    mapping(uint256 projectId => mapping(address proposer => uint256 timestamp)) private _lastExpulsionByProposer;
    mapping(uint256 projectId => mapping(address target => uint256 timestamp)) private _lastExpulsionByTarget;
    mapping(address proposer => uint256 amount) private _pendingExpulsionBondRefunds;
    mapping(uint256 projectId => RescuePoolSettlement settlement) private _rescuePoolSettlements;
    mapping(uint256 projectId => mapping(address member => bool withdrawn)) private _rescuePoolWithdrawn;

    uint256 private _reentrancyStatus = 1;

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

    constructor() {
        protocolAdmin = msg.sender;
    }

    modifier nonReentrant() {
        require(_reentrancyStatus == 1, "Reentrant call");
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

    modifier projectExists(uint256 projectId) {
        require(_projects[projectId].owner != address(0), "Project not found");
        _;
    }

    modifier bountyExists(uint256 bountyId) {
        require(_bounties[bountyId].creator != address(0), "Bounty not found");
        _;
    }

    modifier expulsionExists(uint256 proposalId) {
        if (_expulsionProposals[proposalId].proposer == address(0)) revert ExpulsionProposalNotFound();
        _;
    }

    modifier onlyProjectOwner(uint256 projectId) {
        require(_projects[projectId].owner == msg.sender, "Only project owner");
        _;
    }

    /// @notice Creates an active project with a required member deposit.
    function createProject(string calldata name, uint256 depositAmount) external returns (uint256 projectId) {
        require(bytes(name).length > 0, "Name is required");
        require(depositAmount > 0, "Deposit must be greater than zero");

        projectId = nextProjectId++;
        _projects[projectId] = Project({
            id: projectId,
            owner: msg.sender,
            name: name,
            depositAmount: depositAmount,
            rescuePool: 0,
            reservedBounty: 0,
            status: ProjectStatus.Active
        });

        emit ProjectCreated(projectId, msg.sender, name, depositAmount);
    }

    /// @notice Marks a project as finished and refunds locked deposits to each active member.
    /// @dev Rescue-pool settlement is initialized before deposit refunds so eligibility stays correct.
    function finishProject(uint256 projectId)
        external
        nonReentrant
        projectExists(projectId)
        onlyProjectOwner(projectId)
    {
        Project storage project = _projects[projectId];
        require(project.status == ProjectStatus.Active, "Project is not active");
        require(project.reservedBounty == 0, "Project has reserved bounties");

        project.status = ProjectStatus.Finished;
        _initializeRescuePoolSettlement(projectId, project);
        _refundActiveDeposits(projectId);

        emit ProjectFinished(projectId);
    }

    /// @notice Cancels an active project, refunds deposits, and opens rescue-pool settlement.
    function cancelProject(uint256 projectId)
        external
        nonReentrant
        projectExists(projectId)
        onlyProjectOwner(projectId)
    {
        Project storage project = _projects[projectId];
        require(project.status == ProjectStatus.Active, "Project is not active");
        require(project.reservedBounty == 0, "Project has reserved bounties");

        project.status = ProjectStatus.Cancelled;
        _initializeRescuePoolSettlement(projectId, project);
        _refundActiveDeposits(projectId);

        emit ProjectCancelled(projectId);
    }

    /// @notice Joins an active project and locks a native-token deposit.
    function joinProject(uint256 projectId) external payable projectExists(projectId) {
        Project storage project = _projects[projectId];
        Member storage member = _members[projectId][msg.sender];

        require(project.status == ProjectStatus.Active, "Project is not active");
        require(member.account == address(0), "Already joined");
        require(msg.value >= project.depositAmount, "Insufficient deposit");
        require(msg.value <= project.depositAmount, "Incorrect deposit");

        _members[projectId][msg.sender] =
            Member({account: msg.sender, deposit: msg.value, active: true, withdrawn: false});
        _projectMembers[projectId].push(msg.sender);
        _activeMemberCounts[projectId] += 1;

        emit MemberJoined(projectId, msg.sender, msg.value);
    }

    /// @notice Leaves an active project and forfeits the entire locked deposit.
    function leaveProject(uint256 projectId) external projectExists(projectId) {
        _leaveProject(projectId);
    }

    /// @notice Leave and publish the forfeited deposit as one open rescue bounty (member self-service, one tx).
    /// @dev Bounty creator is the project owner so the leaver can still claim/rescue later if needed.
    function leaveAndCreateRescueBounty(uint256 projectId, string calldata description)
        external
        projectExists(projectId)
        returns (uint256 bountyId)
    {
        require(bytes(description).length > 0, "Description is required");

        Project storage project = _projects[projectId];
        uint256 forfeitedDeposit = _leaveProject(projectId);

        project.reservedBounty += forfeitedDeposit;
        bountyId = nextBountyId++;
        _bounties[bountyId] = Bounty({
            id: bountyId,
            projectId: projectId,
            description: description,
            reward: forfeitedDeposit,
            creator: project.owner,
            hunter: address(0),
            status: BountyStatus.Open,
            statusUpdatedAt: block.timestamp,
            reviewReason: ""
        });

        emit BountyCreated(bountyId, projectId, project.owner, description, forfeitedDeposit);
    }

    function _leaveProject(uint256 projectId) private returns (uint256 forfeitedDeposit) {
        Project storage project = _projects[projectId];
        Member storage member = _members[projectId][msg.sender];

        require(project.status == ProjectStatus.Active, "Project is not active");
        require(member.active, "Member is not active");
        require(!member.withdrawn, "Deposit already withdrawn");

        forfeitedDeposit = member.deposit;

        member.active = false;
        project.rescuePool += forfeitedDeposit;
        _activeMemberCounts[projectId] -= 1;

        emit MemberLeft(projectId, msg.sender, forfeitedDeposit);
    }

    /// @notice Withdraws an active member's deposit after the project is finished.
    /// @dev Prefer finish/cancel auto-refund. Kept for any edge case where a deposit remains.
    function withdrawDeposit(uint256 projectId) external nonReentrant projectExists(projectId) {
        Project storage project = _projects[projectId];
        Member storage member = _members[projectId][msg.sender];

        require(
            project.status == ProjectStatus.Finished || project.status == ProjectStatus.Cancelled, "Project not ended"
        );
        require(member.active, "No refundable deposit");
        require(!member.withdrawn, "Deposit already withdrawn");

        uint256 amount = member.deposit;

        member.active = false;
        member.withdrawn = true;
        member.deposit = 0;
        _activeMemberCounts[projectId] -= 1;

        (bool success,) = payable(msg.sender).call{value: amount}("");
        require(success, "Deposit transfer failed");

        emit DepositWithdrawn(projectId, msg.sender, amount);
    }

    /// @notice Reserves part of a project's rescue pool for a new bounty.
    function createBounty(uint256 projectId, string calldata description, uint256 reward)
        external
        projectExists(projectId)
        onlyProjectOwner(projectId)
        returns (uint256 bountyId)
    {
        Project storage project = _projects[projectId];

        require(project.status == ProjectStatus.Active, "Project is not active");
        require(bytes(description).length > 0, "Description is required");
        require(reward > 0, "Reward must be greater than zero");

        uint256 availableRescuePool = project.rescuePool - project.reservedBounty;
        require(availableRescuePool >= reward, "Insufficient rescue pool");

        project.reservedBounty += reward;

        bountyId = nextBountyId++;
        _bounties[bountyId] = Bounty({
            id: bountyId,
            projectId: projectId,
            description: description,
            reward: reward,
            creator: msg.sender,
            hunter: address(0),
            status: BountyStatus.Open,
            statusUpdatedAt: block.timestamp,
            reviewReason: ""
        });

        emit BountyCreated(bountyId, projectId, msg.sender, description, reward);
    }

    /// @notice Claims an open rescue bounty.
    function claimBounty(uint256 bountyId) external bountyExists(bountyId) {
        Bounty storage bounty = _bounties[bountyId];
        Project storage project = _projects[bounty.projectId];

        require(project.status == ProjectStatus.Active, "Project is not active");
        require(bounty.status == BountyStatus.Open, "Bounty is not open");
        require(msg.sender != bounty.creator, "Creator cannot claim");

        bounty.hunter = msg.sender;
        bounty.status = BountyStatus.Claimed;
        bounty.statusUpdatedAt = block.timestamp;

        emit BountyClaimed(bountyId, msg.sender);
    }

    /// @notice Releases a claimed bounty back to the open market.
    function cancelClaim(uint256 bountyId) external bountyExists(bountyId) {
        Bounty storage bounty = _bounties[bountyId];

        if (bounty.status != BountyStatus.Claimed && bounty.status != BountyStatus.RevisionRequested) {
            revert InvalidBountyTransition();
        }
        require(bounty.hunter == msg.sender, "Only bounty hunter");

        address previousHunter = bounty.hunter;
        bounty.hunter = address(0);
        bounty.status = BountyStatus.Open;
        bounty.statusUpdatedAt = block.timestamp;
        bounty.reviewReason = "";

        emit BountyClaimCancelled(bountyId, previousHunter);
    }

    /// @notice Marks work as submitted by the current bounty hunter.
    function submitWork(uint256 bountyId) external bountyExists(bountyId) {
        Bounty storage bounty = _bounties[bountyId];

        if (bounty.status != BountyStatus.Claimed && bounty.status != BountyStatus.RevisionRequested) {
            revert InvalidBountyTransition();
        }
        require(bounty.hunter == msg.sender, "Only bounty hunter");

        bounty.status = BountyStatus.Submitted;
        bounty.statusUpdatedAt = block.timestamp;
        bounty.reviewReason = "";

        emit WorkSubmitted(bountyId, msg.sender);
    }

    /// @notice Requests changes from the hunter and allows another submission.
    function requestRevision(uint256 bountyId, string calldata reason) external bountyExists(bountyId) {
        Bounty storage bounty = _bounties[bountyId];
        Project storage project = _projects[bounty.projectId];

        require(project.owner == msg.sender, "Only project owner");
        if (bounty.status != BountyStatus.Submitted) revert InvalidBountyTransition();
        if (bytes(reason).length == 0) revert EmptyReviewReason();

        bounty.status = BountyStatus.RevisionRequested;
        bounty.statusUpdatedAt = block.timestamp;
        bounty.reviewReason = reason;

        emit RevisionRequested(bountyId, msg.sender, reason);
    }

    /// @notice Rejects submitted work and releases its reserved reward.
    function rejectWork(uint256 bountyId, string calldata reason) external bountyExists(bountyId) {
        Bounty storage bounty = _bounties[bountyId];
        Project storage project = _projects[bounty.projectId];

        require(project.owner == msg.sender, "Only project owner");
        if (bounty.status != BountyStatus.Submitted) revert InvalidBountyTransition();
        if (bytes(reason).length == 0) revert EmptyReviewReason();

        bounty.status = BountyStatus.Rejected;
        bounty.statusUpdatedAt = block.timestamp;
        bounty.reviewReason = reason;
        project.reservedBounty -= bounty.reward;

        emit BountyRejected(bountyId, msg.sender, reason);
    }

    /// @notice Approves submitted work and pays the reserved reward.
    function approveWork(uint256 bountyId) external nonReentrant bountyExists(bountyId) {
        Bounty storage bounty = _bounties[bountyId];
        Project storage project = _projects[bounty.projectId];

        require(project.owner == msg.sender, "Only project owner");
        if (bounty.status != BountyStatus.Submitted) revert InvalidBountyTransition();

        uint256 reward = bounty.reward;
        address hunter = bounty.hunter;

        bounty.status = BountyStatus.Approved;
        bounty.statusUpdatedAt = block.timestamp;
        emit BountyApproved(bountyId, msg.sender);

        bounty.status = BountyStatus.Paid;
        project.reservedBounty -= reward;
        project.rescuePool -= reward;

        (bool success,) = payable(hunter).call{value: reward}("");
        require(success, "Reward transfer failed");

        emit BountyPaid(bountyId, hunter, reward);
    }

    /// @notice Cancels an unclaimed bounty and releases its reserved reward.
    function cancelBounty(uint256 bountyId) external bountyExists(bountyId) {
        Bounty storage bounty = _bounties[bountyId];
        Project storage project = _projects[bounty.projectId];

        require(project.owner == msg.sender, "Only project owner");
        require(bounty.status == BountyStatus.Open, "Bounty is not open");

        _cancelBounty(bounty, project, "Cancelled by project owner");
    }

    /// @notice Cancels submitted or revision-requested work and releases its reservation.
    function cancelSubmittedBounty(uint256 bountyId, string calldata reason) external bountyExists(bountyId) {
        Bounty storage bounty = _bounties[bountyId];
        Project storage project = _projects[bounty.projectId];

        require(project.owner == msg.sender, "Only project owner");
        if (bounty.status != BountyStatus.Submitted && bounty.status != BountyStatus.RevisionRequested) {
            revert InvalidBountyTransition();
        }
        if (bytes(reason).length == 0) revert EmptyReviewReason();

        _cancelBounty(bounty, project, reason);
    }

    /// @notice Cancels a stale claim, submission, or revision request after its timeout.
    /// @dev Callable by anyone so an unresponsive hunter or owner cannot lock project funds forever.
    function cancelStaleBounty(uint256 bountyId) external bountyExists(bountyId) {
        Bounty storage bounty = _bounties[bountyId];
        Project storage project = _projects[bounty.projectId];

        string memory reason;
        if (bounty.status == BountyStatus.Claimed) {
            if (block.timestamp < bounty.statusUpdatedAt + BOUNTY_CLAIM_PERIOD) revert BountyClaimPeriodActive();
            reason = "Claim period expired";
        } else if (bounty.status == BountyStatus.Submitted || bounty.status == BountyStatus.RevisionRequested) {
            if (block.timestamp < bounty.statusUpdatedAt + BOUNTY_REVIEW_PERIOD) revert BountyReviewPeriodActive();
            reason = "Review period expired";
        } else {
            revert InvalidBountyTransition();
        }

        _cancelBounty(bounty, project, reason);
    }

    /// @notice Starts a three-day member vote to expel an inactive contributor.
    /// @dev Only the project creator may propose. No proposal bond is required.
    function proposeExpulsion(uint256 projectId, address target)
        external
        payable
        projectExists(projectId)
        returns (uint256 proposalId)
    {
        return _proposeExpulsion(projectId, target, "");
    }

    /// @notice Starts an expulsion vote and records a public, human-readable reason.
    /// @dev Kept separate from proposeExpulsion for backwards ABI compatibility.
    function proposeExpulsionWithReason(uint256 projectId, address target, string calldata reason)
        external
        payable
        projectExists(projectId)
        returns (uint256 proposalId)
    {
        if (bytes(reason).length == 0) revert EmptyExpulsionReason();
        return _proposeExpulsion(projectId, target, reason);
    }

    function _proposeExpulsion(uint256 projectId, address target, string memory reason)
        internal
        returns (uint256 proposalId)
    {
        Project storage project = _projects[projectId];

        require(project.status == ProjectStatus.Active, "Project is not active");
        require(msg.sender == project.owner, "Only project owner");
        if (target == msg.sender) revert CannotExpelSelf();
        if (!_members[projectId][target].active) revert TargetNotActive();
        if (_activeMemberCounts[projectId] < 3) revert InsufficientActiveMembers();
        if (_activeExpulsionByTarget[projectId][target] != 0) revert TargetHasOpenProposal();
        if (_activeExpulsionByProposer[projectId][msg.sender] != 0) revert ProposerHasOpenProposal();
        if (_expulsionProposalCounts[projectId] >= getExpulsionProposalLimit(projectId)) {
            revert ExpulsionProposalLimitReached();
        }

        uint256 proposerLastActive = _lastExpulsionByProposer[projectId][msg.sender];
        uint256 targetLastActive = _lastExpulsionByTarget[projectId][target];
        if (
            (proposerLastActive != 0 && block.timestamp < proposerLastActive + EXPULSION_COOLDOWN)
                || (targetLastActive != 0 && block.timestamp < targetLastActive + EXPULSION_COOLDOWN)
        ) {
            revert ExpulsionCooldownActive();
        }

        // Creator-initiated freeloader removal does not require a proposal bond.
        if (msg.value != 0) revert IncorrectExpulsionBond(0, msg.value);

        proposalId = nextExpulsionId++;
        _expulsionProposals[proposalId] = ExpulsionProposal({
            id: proposalId,
            projectId: projectId,
            target: target,
            proposer: msg.sender,
            approveVotes: 0,
            rejectVotes: 0,
            deadline: block.timestamp + EXPULSION_VOTING_PERIOD,
            bondAmount: 0,
            executed: false,
            reason: reason
        });

        _activeExpulsionByTarget[projectId][target] = proposalId;
        _activeExpulsionByProposer[projectId][msg.sender] = proposalId;
        _openExpulsionCounts[projectId] += 1;
        _expulsionProposalCounts[projectId] += 1;

        emit ExpulsionProposed(proposalId, projectId, msg.sender, target, 0);
        if (bytes(reason).length != 0) emit ExpulsionReasonRecorded(proposalId, reason);
    }

    /// @notice Allows the protocol admin to approve additional proposals for a project.
    function approveAdditionalExpulsions(uint256 projectId, uint256 additionalLimit) external projectExists(projectId) {
        if (msg.sender != protocolAdmin) revert OnlyProtocolAdmin();
        require(additionalLimit > 0, "Additional limit is zero");

        _expulsionLimitExtensions[projectId] += additionalLimit;

        emit ExpulsionLimitExtended(projectId, additionalLimit, getExpulsionProposalLimit(projectId));
    }

    /// @notice Casts one vote on an active expulsion proposal.
    /// @dev The expulsion target cannot vote on their own removal.
    function voteExpulsion(uint256 proposalId, bool support) external expulsionExists(proposalId) {
        ExpulsionProposal storage proposal = _expulsionProposals[proposalId];
        Project storage project = _projects[proposal.projectId];

        require(project.status == ProjectStatus.Active, "Project is not active");
        if (!_members[proposal.projectId][msg.sender].active) revert OnlyActiveMember();
        if (msg.sender == proposal.target) revert CannotVoteAsExpulsionTarget();
        if (proposal.executed) revert ExpulsionAlreadyExecuted();
        if (block.timestamp >= proposal.deadline) revert ExpulsionVotingEnded();
        if (_expulsionVoted[proposalId][msg.sender]) revert ExpulsionAlreadyVoted();

        _expulsionVoted[proposalId][msg.sender] = true;

        if (support) {
            proposal.approveVotes += 1;
        } else {
            proposal.rejectVotes += 1;
        }

        emit ExpulsionVoted(proposalId, msg.sender, support);
    }

    /// @notice Finalizes an expulsion vote after its deadline.
    /// @dev A strict majority of the project's current active members is required.
    ///      When passed, the forfeited deposit is auto-published as one open rescue bounty.
    function executeExpulsion(uint256 proposalId) external nonReentrant expulsionExists(proposalId) {
        ExpulsionProposal storage proposal = _expulsionProposals[proposalId];
        Project storage project = _projects[proposal.projectId];
        Member storage targetMember = _members[proposal.projectId][proposal.target];

        if (proposal.executed) revert ExpulsionAlreadyExecuted();
        if (project.status == ProjectStatus.Active && block.timestamp < proposal.deadline) {
            revert ExpulsionVotingActive();
        }

        proposal.executed = true;
        _activeExpulsionByTarget[proposal.projectId][proposal.target] = 0;
        _activeExpulsionByProposer[proposal.projectId][proposal.proposer] = 0;
        _openExpulsionCounts[proposal.projectId] -= 1;
        _lastExpulsionByProposer[proposal.projectId][proposal.proposer] = block.timestamp;
        _lastExpulsionByTarget[proposal.projectId][proposal.target] = block.timestamp;

        // Project settlement takes priority over pending governance. The proposal
        // becomes void and its bond remains fully refundable.
        if (project.status != ProjectStatus.Active) {
            _pendingExpulsionBondRefunds[proposal.proposer] += proposal.bondAmount;
            emit ExpulsionFinalized(proposalId, false, proposal.bondAmount, 0);
            return;
        }

        bool passed = targetMember.active && proposal.approveVotes > _activeMemberCounts[proposal.projectId] / 2;

        if (passed) {
            uint256 forfeitedDeposit = targetMember.deposit;

            targetMember.active = false;
            targetMember.deposit = 0;
            project.rescuePool += forfeitedDeposit;
            _activeMemberCounts[proposal.projectId] -= 1;

            emit MemberExpelled(proposal.projectId, proposal.target, forfeitedDeposit);

            if (forfeitedDeposit > 0) {
                project.reservedBounty += forfeitedDeposit;
                uint256 bountyId = nextBountyId++;
                string memory description =
                    bytes(proposal.reason).length != 0 ? proposal.reason : "Expelled member rescue";
                _bounties[bountyId] = Bounty({
                    id: bountyId,
                    projectId: proposal.projectId,
                    description: description,
                    reward: forfeitedDeposit,
                    creator: project.owner,
                    hunter: address(0),
                    status: BountyStatus.Open,
                    statusUpdatedAt: block.timestamp,
                    reviewReason: ""
                });
                emit BountyCreated(bountyId, proposal.projectId, project.owner, description, forfeitedDeposit);
            }

            _pendingExpulsionBondRefunds[proposal.proposer] += proposal.bondAmount;
            emit ExpulsionFinalized(proposalId, true, proposal.bondAmount, 0);
        } else {
            uint256 slashedBond = _calculateBps(proposal.bondAmount, FAILED_EXPULSION_SLASH_BPS);
            uint256 refundedBond = proposal.bondAmount - slashedBond;

            project.rescuePool += slashedBond;
            _pendingExpulsionBondRefunds[proposal.proposer] += refundedBond;

            emit ExpulsionFinalized(proposalId, false, refundedBond, slashedBond);
        }
    }

    /// @notice Withdraws expulsion bonds credited after proposal finalization.
    function withdrawExpulsionBondRefund() external nonReentrant {
        uint256 amount = _pendingExpulsionBondRefunds[msg.sender];
        if (amount == 0) revert NoExpulsionBondRefund();

        _pendingExpulsionBondRefunds[msg.sender] = 0;

        (bool success,) = payable(msg.sender).call{value: amount}("");
        require(success, "Expulsion bond transfer failed");

        emit ExpulsionBondWithdrawn(msg.sender, amount);
    }

    /// @notice Claims an equal share of the rescue pool after project settlement.
    /// @dev Eligibility is snapshotted by member count when the project ends. A member
    ///      remains eligible after withdrawing their original deposit.
    function withdrawRemainingRescuePool(uint256 projectId) external nonReentrant projectExists(projectId) {
        Project storage project = _projects[projectId];
        RescuePoolSettlement storage settlement = _rescuePoolSettlements[projectId];
        Member storage member = _members[projectId][msg.sender];

        if (!settlement.initialized || settlement.eligibleMembers == 0) revert RescuePoolSettlementUnavailable();
        if (settlement.totalAmount == 0) revert NoRescuePoolBalance();
        if (block.timestamp > settlement.claimDeadline) revert RescuePoolClaimPeriodEnded();
        if (!member.active && !member.withdrawn) revert NotRescuePoolBeneficiary();
        if (_rescuePoolWithdrawn[projectId][msg.sender]) revert RescuePoolAlreadyWithdrawn();

        uint256 baseShare = settlement.totalAmount / settlement.eligibleMembers;
        uint256 extraShares = settlement.totalAmount % settlement.eligibleMembers;
        uint256 amount = baseShare + (settlement.claimedMembers < extraShares ? 1 : 0);

        _rescuePoolWithdrawn[projectId][msg.sender] = true;
        settlement.claimedMembers += 1;
        settlement.remainingAmount -= amount;
        project.rescuePool -= amount;

        (bool success,) = payable(msg.sender).call{value: amount}("");
        require(success, "Rescue pool transfer failed");

        emit RescuePoolWithdrawn(projectId, msg.sender, amount);
    }

    /// @notice Sends unclaimed rescue funds to the project owner after the claim period.
    /// @dev If no active members existed at settlement, the owner can sweep immediately.
    function sweepUnclaimedRescuePool(uint256 projectId)
        external
        nonReentrant
        projectExists(projectId)
        onlyProjectOwner(projectId)
    {
        Project storage project = _projects[projectId];
        RescuePoolSettlement storage settlement = _rescuePoolSettlements[projectId];

        if (!settlement.initialized) revert RescuePoolSettlementUnavailable();
        if (settlement.remainingAmount == 0) revert NoRescuePoolBalance();
        if (settlement.eligibleMembers != 0 && block.timestamp <= settlement.claimDeadline) {
            revert RescuePoolClaimPeriodActive();
        }

        uint256 amount = settlement.remainingAmount;
        settlement.remainingAmount = 0;
        project.rescuePool -= amount;

        (bool success,) = payable(msg.sender).call{value: amount}("");
        require(success, "Rescue pool transfer failed");

        emit UnclaimedRescuePoolSwept(projectId, msg.sender, amount);
    }

    function getProject(uint256 projectId) external view projectExists(projectId) returns (Project memory) {
        return _projects[projectId];
    }

    function getMember(uint256 projectId, address account)
        external
        view
        projectExists(projectId)
        returns (Member memory)
    {
        require(_members[projectId][account].account != address(0), "Member not found");
        return _members[projectId][account];
    }

    function getBounty(uint256 bountyId) external view bountyExists(bountyId) returns (Bounty memory) {
        return _bounties[bountyId];
    }

    function getExpulsionProposal(uint256 proposalId)
        external
        view
        expulsionExists(proposalId)
        returns (ExpulsionProposal memory)
    {
        return _expulsionProposals[proposalId];
    }

    function getActiveExpulsionProposalByTarget(uint256 projectId, address target)
        external
        view
        projectExists(projectId)
        returns (uint256)
    {
        return _activeExpulsionByTarget[projectId][target];
    }

    function getActiveExpulsionProposalByProposer(uint256 projectId, address proposer)
        external
        view
        projectExists(projectId)
        returns (uint256)
    {
        return _activeExpulsionByProposer[projectId][proposer];
    }

    function hasVoted(uint256 proposalId, address voter) external view expulsionExists(proposalId) returns (bool) {
        return _expulsionVoted[proposalId][voter];
    }

    /// @notice Kept for ABI compatibility; creator-initiated expulsion no longer requires a bond.
    function getRequiredExpulsionBond(uint256 projectId) public view projectExists(projectId) returns (uint256) {
        return 0;
    }

    function getExpulsionProposalCount(uint256 projectId) external view projectExists(projectId) returns (uint256) {
        return _expulsionProposalCounts[projectId];
    }

    function getExpulsionProposalLimit(uint256 projectId) public view projectExists(projectId) returns (uint256) {
        return DEFAULT_MAX_EXPULSION_PROPOSALS + _expulsionLimitExtensions[projectId];
    }

    function getPendingExpulsionBondRefund(address proposer) external view returns (uint256) {
        return _pendingExpulsionBondRefunds[proposer];
    }

    function getActiveMemberCount(uint256 projectId) external view projectExists(projectId) returns (uint256) {
        return _activeMemberCounts[projectId];
    }

    /// @notice Addresses that have joined this project (including members who later left / were expelled).
    function getProjectMembers(uint256 projectId) external view projectExists(projectId) returns (address[] memory) {
        return _projectMembers[projectId];
    }

    function getRescuePoolSettlement(uint256 projectId)
        external
        view
        projectExists(projectId)
        returns (RescuePoolSettlement memory)
    {
        return _rescuePoolSettlements[projectId];
    }

    function hasWithdrawnRemainingRescuePool(uint256 projectId, address member)
        external
        view
        projectExists(projectId)
        returns (bool)
    {
        return _rescuePoolWithdrawn[projectId][member];
    }

    /// @notice Returns the rescue pool amount not currently reserved by bounties.
    function getAvailableRescuePool(uint256 projectId) external view projectExists(projectId) returns (uint256) {
        Project storage project = _projects[projectId];
        return project.rescuePool - project.reservedBounty;
    }

    function _cancelBounty(Bounty storage bounty, Project storage project, string memory reason) internal {
        bounty.status = BountyStatus.Cancelled;
        bounty.statusUpdatedAt = block.timestamp;
        bounty.reviewReason = reason;
        project.reservedBounty -= bounty.reward;

        emit BountyCancelled(bounty.id, bounty.projectId, bounty.reward, reason);
    }

    function _initializeRescuePoolSettlement(uint256 projectId, Project storage project) internal {
        uint256 eligibleMembers = _activeMemberCounts[projectId];
        uint256 claimDeadline = eligibleMembers == 0 ? block.timestamp : block.timestamp + RESCUE_POOL_CLAIM_PERIOD;

        _rescuePoolSettlements[projectId] = RescuePoolSettlement({
            totalAmount: project.rescuePool,
            remainingAmount: project.rescuePool,
            eligibleMembers: eligibleMembers,
            claimedMembers: 0,
            claimDeadline: claimDeadline,
            initialized: true
        });

        emit RescuePoolSettlementCreated(projectId, project.rescuePool, eligibleMembers, claimDeadline);
    }

    /// @dev Pushes locked deposits back to every still-active member. Call after settlement init.
    function _refundActiveDeposits(uint256 projectId) internal {
        address[] storage members = _projectMembers[projectId];
        for (uint256 i = 0; i < members.length; ++i) {
            address account = members[i];
            Member storage member = _members[projectId][account];
            if (!member.active || member.withdrawn) continue;

            uint256 amount = member.deposit;
            member.active = false;
            member.withdrawn = true;
            member.deposit = 0;
            _activeMemberCounts[projectId] -= 1;

            (bool success,) = payable(account).call{value: amount}("");
            require(success, "Deposit transfer failed");

            emit DepositWithdrawn(projectId, account, amount);
        }
    }

    function _calculateBps(uint256 amount, uint256 bps) internal pure returns (uint256) {
        uint256 quotient = amount / BPS_DENOMINATOR;
        uint256 remainder = amount % BPS_DENOMINATOR;
        uint256 result = quotient * bps + (remainder * bps) / BPS_DENOMINATOR;

        // A non-zero project deposit must always produce a non-zero proposal bond.
        return result == 0 && amount != 0 && bps != 0 ? 1 : result;
    }
}
