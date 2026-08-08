// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {DontGhostMe} from "../src/DontGhostMe.sol";

contract DontGhostMeTest is Test {
    DontGhostMe internal dgm;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal hunter = makeAddr("hunter");

    uint256 internal constant DEPOSIT = 1 ether;
    uint256 internal constant REWARD = 0.8 ether;

    event ProjectCreated(uint256 indexed projectId, address indexed owner, string name, uint256 depositAmount);
    event MemberJoined(uint256 indexed projectId, address indexed member, uint256 deposit);
    event MemberLeft(uint256 indexed projectId, address indexed member, uint256 forfeitedDeposit);
    event DepositWithdrawn(uint256 indexed projectId, address indexed member, uint256 amount);
    event BountyCreated(
        uint256 indexed bountyId, uint256 indexed projectId, address indexed creator, string description, uint256 reward
    );
    event BountyPaid(uint256 indexed bountyId, address indexed hunter, uint256 reward);
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

    function setUp() public {
        dgm = new DontGhostMe();

        vm.deal(owner, 20 ether);
        vm.deal(alice, 20 ether);
        vm.deal(bob, 20 ether);
        vm.deal(carol, 20 ether);
        vm.deal(dave, 20 ether);
        vm.deal(hunter, 20 ether);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _createProject() internal returns (uint256 projectId) {
        vm.prank(owner);
        projectId = dgm.createProject("Hackathon", DEPOSIT);
    }

    function _join(uint256 projectId, address member) internal {
        vm.prank(member);
        dgm.joinProject{value: DEPOSIT}(projectId);
    }

    function _seedThreeMembers(uint256 projectId) internal {
        _join(projectId, alice);
        _join(projectId, bob);
        _join(projectId, carol);
    }

    function _proposeExpulsion(uint256 projectId, address proposer, address target)
        internal
        returns (uint256 proposalId)
    {
        vm.prank(proposer);
        proposalId = dgm.proposeExpulsion(projectId, target);
    }

    function _createOpenBounty(uint256 projectId) internal returns (uint256 bountyId) {
        _join(projectId, alice);
        vm.prank(alice);
        dgm.leaveProject(projectId);

        vm.prank(owner);
        bountyId = dgm.createBounty(projectId, "Take over contracts", REWARD);
    }

    function _createSubmittedBounty(uint256 projectId) internal returns (uint256 bountyId) {
        bountyId = _createOpenBounty(projectId);

        vm.prank(hunter);
        dgm.claimBounty(bountyId);
        vm.prank(hunter);
        dgm.submitWork(bountyId);
    }

    // ---------------------------------------------------------------------
    // Project / Member
    // ---------------------------------------------------------------------

    function test_CreateProject_SetsOwnerAndDeposit() public {
        vm.expectEmit(true, true, false, true);
        emit ProjectCreated(1, owner, "Hackathon", DEPOSIT);

        uint256 projectId = _createProject();

        DontGhostMe.Project memory project = dgm.getProject(projectId);
        assertEq(project.id, 1);
        assertEq(project.owner, owner);
        assertEq(project.name, "Hackathon");
        assertEq(project.depositAmount, DEPOSIT);
        assertEq(project.rescuePool, 0);
        assertEq(project.reservedBounty, 0);
        assertEq(uint256(project.status), uint256(DontGhostMe.ProjectStatus.Active));
        assertEq(dgm.nextProjectId(), 2);
    }

    function test_JoinProject_LocksDeposit() public {
        uint256 projectId = _createProject();

        vm.expectEmit(true, true, false, true);
        emit MemberJoined(projectId, alice, DEPOSIT);

        _join(projectId, alice);

        DontGhostMe.Member memory member = dgm.getMember(projectId, alice);
        assertEq(member.account, alice);
        assertEq(member.deposit, DEPOSIT);
        assertTrue(member.active);
        assertFalse(member.withdrawn);
        assertEq(dgm.getActiveMemberCount(projectId), 1);
        assertEq(address(dgm).balance, DEPOSIT);
    }

    function test_JoinProject_RevertsWhenDepositTooLow() public {
        uint256 projectId = _createProject();

        vm.prank(alice);
        vm.expectRevert("Insufficient deposit");
        dgm.joinProject{value: DEPOSIT - 1}(projectId);
    }

    function test_JoinProject_RevertsWhenDepositExceedsRequiredAmount() public {
        uint256 projectId = _createProject();

        vm.prank(alice);
        vm.expectRevert("Incorrect deposit");
        dgm.joinProject{value: DEPOSIT + 1}(projectId);
    }

    function test_JoinProject_RevertsWhenAlreadyJoined() public {
        uint256 projectId = _createProject();
        _join(projectId, alice);

        vm.prank(alice);
        vm.expectRevert("Already joined");
        dgm.joinProject{value: DEPOSIT}(projectId);
    }

    function test_LeaveProject_FundsRescuePool() public {
        uint256 projectId = _createProject();
        _join(projectId, alice);

        vm.expectEmit(true, true, false, true);
        emit MemberLeft(projectId, alice, DEPOSIT);

        vm.prank(alice);
        dgm.leaveProject(projectId);

        DontGhostMe.Project memory project = dgm.getProject(projectId);
        assertEq(project.rescuePool, DEPOSIT);
        assertEq(dgm.getAvailableRescuePool(projectId), DEPOSIT);
        assertEq(dgm.getActiveMemberCount(projectId), 0);

        DontGhostMe.Member memory member = dgm.getMember(projectId, alice);
        assertFalse(member.active);
        assertEq(member.deposit, DEPOSIT);
    }

    function test_LeaveAndCreateRescueBounty_PublishesFullDeposit() public {
        uint256 projectId = _createProject();
        _join(projectId, alice);

        vm.expectEmit(true, true, false, true);
        emit MemberLeft(projectId, alice, DEPOSIT);
        vm.expectEmit(true, true, true, true);
        emit BountyCreated(1, projectId, owner, "Alice exit rescue", DEPOSIT);

        vm.prank(alice);
        uint256 bountyId = dgm.leaveAndCreateRescueBounty(projectId, "Alice exit rescue");

        DontGhostMe.Project memory project = dgm.getProject(projectId);
        assertEq(project.rescuePool, DEPOSIT);
        assertEq(project.reservedBounty, DEPOSIT);
        assertEq(dgm.getAvailableRescuePool(projectId), 0);

        DontGhostMe.Bounty memory bounty = dgm.getBounty(bountyId);
        assertEq(bountyId, 1);
        assertEq(bounty.projectId, projectId);
        assertEq(bounty.reward, DEPOSIT);
        assertEq(bounty.creator, owner);
        assertEq(uint256(bounty.status), uint256(DontGhostMe.BountyStatus.Open));
    }

    function test_FinishProject_AutoRefundsDeposits() public {
        uint256 projectId = _createProject();
        _join(projectId, alice);

        uint256 balanceBefore = alice.balance;

        vm.expectEmit(true, true, false, true);
        emit DepositWithdrawn(projectId, alice, DEPOSIT);

        vm.prank(owner);
        dgm.finishProject(projectId);

        DontGhostMe.Member memory member = dgm.getMember(projectId, alice);
        assertFalse(member.active);
        assertTrue(member.withdrawn);
        assertEq(member.deposit, 0);
        assertEq(alice.balance, balanceBefore + DEPOSIT);
        assertEq(dgm.getActiveMemberCount(projectId), 0);
        assertEq(dgm.getProjectMembers(projectId).length, 1);
        assertEq(dgm.getProjectMembers(projectId)[0], alice);

        vm.prank(alice);
        vm.expectRevert("No refundable deposit");
        dgm.withdrawDeposit(projectId);
    }

    function test_FinishProject_InvalidatesOpenExpulsionAndRefundsBond() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        uint256 bond = dgm.getRequiredExpulsionBond(projectId);
        assertEq(bond, 0);
        uint256 proposalId = _proposeExpulsion(projectId, owner, carol);

        vm.prank(owner);
        dgm.finishProject(projectId);

        dgm.executeExpulsion(proposalId);
        assertEq(dgm.getPendingExpulsionBondRefund(owner), bond);
        // Finish already auto-refunded deposits; expulsion against a finished project should not re-activate members.
        assertFalse(dgm.getMember(projectId, carol).active);
        assertTrue(dgm.getMember(projectId, carol).withdrawn);
    }

    function test_FinishProject_DistributesRemainingRescuePoolEqually() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        vm.prank(carol);
        dgm.leaveProject(projectId);

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;

        vm.prank(owner);
        dgm.finishProject(projectId);

        // Deposits are auto-refunded on finish.
        assertEq(alice.balance, aliceBefore + DEPOSIT);
        assertEq(bob.balance, bobBefore + DEPOSIT);
        assertEq(dgm.getActiveMemberCount(projectId), 0);

        DontGhostMe.RescuePoolSettlement memory settlement = dgm.getRescuePoolSettlement(projectId);
        assertTrue(settlement.initialized);
        assertEq(settlement.totalAmount, DEPOSIT);
        assertEq(settlement.remainingAmount, DEPOSIT);
        assertEq(settlement.eligibleMembers, 2);

        aliceBefore = alice.balance;
        vm.prank(alice);
        dgm.withdrawRemainingRescuePool(projectId);
        assertEq(alice.balance, aliceBefore + DEPOSIT / 2);

        bobBefore = bob.balance;
        vm.prank(bob);
        dgm.withdrawRemainingRescuePool(projectId);
        assertEq(bob.balance, bobBefore + DEPOSIT / 2);

        settlement = dgm.getRescuePoolSettlement(projectId);
        assertEq(settlement.remainingAmount, 0);
        assertEq(settlement.claimedMembers, 2);
        assertEq(dgm.getProject(projectId).rescuePool, 0);
        assertTrue(dgm.hasWithdrawnRemainingRescuePool(projectId, alice));
        assertTrue(dgm.hasWithdrawnRemainingRescuePool(projectId, bob));
    }

    function test_CancelProject_RefundsDepositsAndDistributesRescuePool() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        vm.prank(carol);
        dgm.leaveProject(projectId);

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;

        vm.prank(owner);
        dgm.cancelProject(projectId);

        assertEq(uint256(dgm.getProject(projectId).status), uint256(DontGhostMe.ProjectStatus.Cancelled));
        assertEq(alice.balance, aliceBefore + DEPOSIT);
        assertEq(bob.balance, bobBefore + DEPOSIT);

        aliceBefore = alice.balance;
        vm.prank(alice);
        dgm.withdrawRemainingRescuePool(projectId);
        assertEq(alice.balance, aliceBefore + DEPOSIT / 2);

        bobBefore = bob.balance;
        vm.prank(bob);
        dgm.withdrawRemainingRescuePool(projectId);
        assertEq(bob.balance, bobBefore + DEPOSIT / 2);
        assertEq(address(dgm).balance, 0);
    }

    function test_WithdrawRemainingRescuePool_RevertsOnDuplicateClaim() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        vm.prank(carol);
        dgm.leaveProject(projectId);
        vm.prank(owner);
        dgm.finishProject(projectId);

        vm.prank(alice);
        dgm.withdrawRemainingRescuePool(projectId);

        vm.prank(alice);
        vm.expectRevert(DontGhostMe.RescuePoolAlreadyWithdrawn.selector);
        dgm.withdrawRemainingRescuePool(projectId);
    }

    function test_SweepUnclaimedRescuePool_AfterClaimDeadline() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        vm.prank(carol);
        dgm.leaveProject(projectId);
        vm.prank(owner);
        dgm.finishProject(projectId);

        vm.prank(owner);
        vm.expectRevert(DontGhostMe.RescuePoolClaimPeriodActive.selector);
        dgm.sweepUnclaimedRescuePool(projectId);

        vm.prank(alice);
        dgm.withdrawRemainingRescuePool(projectId);

        DontGhostMe.RescuePoolSettlement memory settlement = dgm.getRescuePoolSettlement(projectId);
        vm.warp(settlement.claimDeadline + 1);

        uint256 ownerBefore = owner.balance;
        vm.prank(owner);
        dgm.sweepUnclaimedRescuePool(projectId);

        assertEq(owner.balance, ownerBefore + DEPOSIT / 2);
        assertEq(dgm.getProject(projectId).rescuePool, 0);
        assertEq(dgm.getRescuePoolSettlement(projectId).remainingAmount, 0);
    }

    function test_SweepUnclaimedRescuePool_ImmediateWhenNoEligibleMembers() public {
        uint256 projectId = _createProject();
        _join(projectId, alice);

        vm.prank(alice);
        dgm.leaveProject(projectId);
        vm.prank(owner);
        dgm.finishProject(projectId);

        uint256 ownerBefore = owner.balance;
        vm.prank(owner);
        dgm.sweepUnclaimedRescuePool(projectId);

        assertEq(owner.balance, ownerBefore + DEPOSIT);
        assertEq(dgm.getProject(projectId).rescuePool, 0);
    }

    // ---------------------------------------------------------------------
    // Bounty flow
    // ---------------------------------------------------------------------

    function test_FullBountyFlow_PaysHunterFromRescuePool() public {
        uint256 projectId = _createProject();
        uint256 bountyId = _createOpenBounty(projectId);

        DontGhostMe.Project memory funded = dgm.getProject(projectId);
        assertEq(funded.rescuePool, DEPOSIT);
        assertEq(funded.reservedBounty, REWARD);
        assertEq(dgm.getAvailableRescuePool(projectId), DEPOSIT - REWARD);

        vm.prank(hunter);
        dgm.claimBounty(bountyId);

        vm.prank(hunter);
        dgm.submitWork(bountyId);

        uint256 hunterBefore = hunter.balance;

        vm.expectEmit(true, true, false, true);
        emit BountyPaid(bountyId, hunter, REWARD);

        vm.prank(owner);
        dgm.approveWork(bountyId);

        DontGhostMe.Bounty memory bounty = dgm.getBounty(bountyId);
        DontGhostMe.Project memory project = dgm.getProject(projectId);

        assertEq(uint256(bounty.status), uint256(DontGhostMe.BountyStatus.Paid));
        assertEq(project.reservedBounty, 0);
        assertEq(project.rescuePool, DEPOSIT - REWARD);
        assertEq(hunter.balance, hunterBefore + REWARD);
        assertEq(address(dgm).balance, DEPOSIT - REWARD);
    }

    function test_CancelClaim_ReturnsBountyToOpen() public {
        uint256 projectId = _createProject();
        uint256 bountyId = _createOpenBounty(projectId);

        vm.prank(hunter);
        dgm.claimBounty(bountyId);

        vm.prank(hunter);
        dgm.cancelClaim(bountyId);

        DontGhostMe.Bounty memory bounty = dgm.getBounty(bountyId);
        assertEq(bounty.hunter, address(0));
        assertEq(uint256(bounty.status), uint256(DontGhostMe.BountyStatus.Open));
    }

    function test_CancelBounty_ReleasesReservedReward() public {
        uint256 projectId = _createProject();
        uint256 bountyId = _createOpenBounty(projectId);

        vm.prank(owner);
        dgm.cancelBounty(bountyId);

        DontGhostMe.Bounty memory bounty = dgm.getBounty(bountyId);
        DontGhostMe.Project memory project = dgm.getProject(projectId);

        assertEq(uint256(bounty.status), uint256(DontGhostMe.BountyStatus.Cancelled));
        assertEq(project.reservedBounty, 0);
        assertEq(project.rescuePool, DEPOSIT);
        assertEq(dgm.getAvailableRescuePool(projectId), DEPOSIT);
    }

    function test_CreateBounty_RevertsWhenRewardExceedsAvailablePool() public {
        uint256 projectId = _createProject();
        _join(projectId, alice);

        vm.prank(alice);
        dgm.leaveProject(projectId);

        vm.prank(owner);
        vm.expectRevert("Insufficient rescue pool");
        dgm.createBounty(projectId, "Too expensive", DEPOSIT + 1);
    }

    function test_ClaimBounty_RevertsForCreator() public {
        uint256 projectId = _createProject();
        uint256 bountyId = _createOpenBounty(projectId);

        vm.prank(owner);
        vm.expectRevert("Creator cannot claim");
        dgm.claimBounty(bountyId);
    }

    function test_ApproveWork_RevertsWhenNotOwner() public {
        uint256 projectId = _createProject();
        uint256 bountyId = _createOpenBounty(projectId);

        vm.prank(hunter);
        dgm.claimBounty(bountyId);
        vm.prank(hunter);
        dgm.submitWork(bountyId);

        vm.prank(alice);
        vm.expectRevert("Only project owner");
        dgm.approveWork(bountyId);
    }

    function test_RequestRevision_AllowsHunterToResubmit() public {
        uint256 projectId = _createProject();
        uint256 bountyId = _createSubmittedBounty(projectId);

        vm.prank(owner);
        dgm.requestRevision(bountyId, "Add integration tests");

        DontGhostMe.Bounty memory revision = dgm.getBounty(bountyId);
        assertEq(uint256(revision.status), uint256(DontGhostMe.BountyStatus.RevisionRequested));
        assertEq(revision.reviewReason, "Add integration tests");
        assertEq(dgm.getProject(projectId).reservedBounty, REWARD);

        vm.prank(hunter);
        dgm.submitWork(bountyId);

        DontGhostMe.Bounty memory resubmitted = dgm.getBounty(bountyId);
        assertEq(uint256(resubmitted.status), uint256(DontGhostMe.BountyStatus.Submitted));
        assertEq(resubmitted.reviewReason, "");
    }

    function test_RejectWork_RecordsReasonAndReleasesReservation() public {
        uint256 projectId = _createProject();
        uint256 bountyId = _createSubmittedBounty(projectId);

        vm.prank(owner);
        dgm.rejectWork(bountyId, "Deliverables do not meet acceptance criteria");

        DontGhostMe.Bounty memory bounty = dgm.getBounty(bountyId);
        DontGhostMe.Project memory project = dgm.getProject(projectId);
        assertEq(uint256(bounty.status), uint256(DontGhostMe.BountyStatus.Rejected));
        assertEq(bounty.reviewReason, "Deliverables do not meet acceptance criteria");
        assertEq(project.reservedBounty, 0);
        assertEq(project.rescuePool, DEPOSIT);
        assertEq(dgm.getAvailableRescuePool(projectId), DEPOSIT);
    }

    function test_CancelSubmittedBounty_RecordsReasonAndReleasesReservation() public {
        uint256 projectId = _createProject();
        uint256 bountyId = _createSubmittedBounty(projectId);

        vm.prank(owner);
        dgm.cancelSubmittedBounty(bountyId, "Project scope changed");

        DontGhostMe.Bounty memory bounty = dgm.getBounty(bountyId);
        DontGhostMe.Project memory project = dgm.getProject(projectId);
        assertEq(uint256(bounty.status), uint256(DontGhostMe.BountyStatus.Cancelled));
        assertEq(bounty.reviewReason, "Project scope changed");
        assertEq(project.reservedBounty, 0);
        assertEq(project.rescuePool, DEPOSIT);
    }

    function test_CancelStaleBounty_ReleasesReservationAfterReviewPeriod() public {
        uint256 projectId = _createProject();
        uint256 bountyId = _createSubmittedBounty(projectId);

        vm.warp(block.timestamp + dgm.BOUNTY_REVIEW_PERIOD());

        vm.prank(bob);
        dgm.cancelStaleBounty(bountyId);

        DontGhostMe.Bounty memory bounty = dgm.getBounty(bountyId);
        DontGhostMe.Project memory project = dgm.getProject(projectId);
        assertEq(uint256(bounty.status), uint256(DontGhostMe.BountyStatus.Cancelled));
        assertEq(bounty.reviewReason, "Review period expired");
        assertEq(project.reservedBounty, 0);
    }

    function test_CancelStaleBounty_RevertsBeforeReviewPeriod() public {
        uint256 projectId = _createProject();
        uint256 bountyId = _createSubmittedBounty(projectId);

        vm.expectRevert(DontGhostMe.BountyReviewPeriodActive.selector);
        dgm.cancelStaleBounty(bountyId);
    }

    function test_CancelStaleClaim_ReleasesReservationAndAllowsProjectCancellation() public {
        uint256 projectId = _createProject();
        uint256 bountyId = _createOpenBounty(projectId);

        vm.prank(hunter);
        dgm.claimBounty(bountyId);

        vm.expectRevert(DontGhostMe.BountyClaimPeriodActive.selector);
        dgm.cancelStaleBounty(bountyId);

        vm.warp(block.timestamp + dgm.BOUNTY_CLAIM_PERIOD());
        dgm.cancelStaleBounty(bountyId);

        assertEq(uint256(dgm.getBounty(bountyId).status), uint256(DontGhostMe.BountyStatus.Cancelled));
        assertEq(dgm.getProject(projectId).reservedBounty, 0);

        vm.prank(owner);
        dgm.cancelProject(projectId);
        assertEq(uint256(dgm.getProject(projectId).status), uint256(DontGhostMe.ProjectStatus.Cancelled));
    }

    function test_RejectWork_RevertsOutsideSubmittedState() public {
        uint256 projectId = _createProject();
        uint256 bountyId = _createOpenBounty(projectId);

        vm.prank(owner);
        vm.expectRevert(DontGhostMe.InvalidBountyTransition.selector);
        dgm.rejectWork(bountyId, "Invalid transition");
    }

    // ---------------------------------------------------------------------
    // Expulsion governance
    // ---------------------------------------------------------------------

    function test_ProposeExpulsion_CreatesOpenProposal() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        vm.expectEmit(true, true, true, true);
        emit ExpulsionProposed(1, projectId, owner, carol, 0);

        uint256 proposalId = _proposeExpulsion(projectId, owner, carol);

        DontGhostMe.ExpulsionProposal memory proposal = dgm.getExpulsionProposal(proposalId);
        assertEq(proposal.id, proposalId);
        assertEq(proposal.projectId, projectId);
        assertEq(proposal.target, carol);
        assertEq(proposal.proposer, owner);
        assertEq(proposal.approveVotes, 0);
        assertEq(proposal.rejectVotes, 0);
        assertEq(proposal.deadline, block.timestamp + dgm.EXPULSION_VOTING_PERIOD());
        assertEq(proposal.bondAmount, 0);
        assertFalse(proposal.executed);
        assertEq(proposal.reason, "");
        assertEq(dgm.getRequiredExpulsionBond(projectId), 0);
    }

    function test_ProposeExpulsionWithReason_StoresReasonAndActiveIndexes() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        vm.expectEmit(true, false, false, true);
        emit ExpulsionReasonRecorded(1, "Missed two delivery checkpoints");
        vm.prank(owner);
        uint256 proposalId =
            dgm.proposeExpulsionWithReason(projectId, carol, "Missed two delivery checkpoints");

        DontGhostMe.ExpulsionProposal memory proposal = dgm.getExpulsionProposal(proposalId);
        assertEq(proposal.reason, "Missed two delivery checkpoints");
        assertEq(dgm.getActiveExpulsionProposalByTarget(projectId, carol), proposalId);
        assertEq(dgm.getActiveExpulsionProposalByProposer(projectId, owner), proposalId);
    }

    function test_ProposeExpulsionWithReason_RevertsWhenReasonEmpty() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        vm.prank(owner);
        vm.expectRevert(DontGhostMe.EmptyExpulsionReason.selector);
        dgm.proposeExpulsionWithReason(projectId, carol, "");
    }

    function test_ProposeExpulsion_RevertsWithFewerThanThreeMembers() public {
        uint256 projectId = _createProject();
        _join(projectId, alice);
        _join(projectId, bob);

        vm.prank(owner);
        vm.expectRevert(DontGhostMe.InsufficientActiveMembers.selector);
        dgm.proposeExpulsion(projectId, bob);
    }

    function test_ProposeExpulsion_RevertsWhenSelfTarget() public {
        uint256 projectId = _createProject();
        _join(projectId, owner);
        _join(projectId, alice);
        _join(projectId, bob);

        vm.prank(owner);
        vm.expectRevert(DontGhostMe.CannotExpelSelf.selector);
        dgm.proposeExpulsion(projectId, owner);
    }

    function test_ProposeExpulsion_RevertsWhenNotProjectOwner() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        vm.prank(alice);
        vm.expectRevert("Only project owner");
        dgm.proposeExpulsion(projectId, carol);
    }

    function test_ProposeExpulsion_RevertsWhenTargetAlreadyHasOpenProposal() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);
        _join(projectId, dave);

        _proposeExpulsion(projectId, owner, carol);

        // Same proposer still has an open proposal; the target index remains locked.
        vm.prank(owner);
        vm.expectRevert(DontGhostMe.ProposerHasOpenProposal.selector);
        dgm.proposeExpulsion(projectId, dave);
    }

    function test_ProposeExpulsion_RevertsWhenProposerAlreadyHasOpenProposal() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);
        _join(projectId, dave);

        _proposeExpulsion(projectId, owner, carol);

        vm.prank(owner);
        vm.expectRevert(DontGhostMe.ProposerHasOpenProposal.selector);
        dgm.proposeExpulsion(projectId, dave);
    }

    function test_ProposeExpulsion_RevertsWhenBondSent() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(DontGhostMe.IncorrectExpulsionBond.selector, uint256(0), uint256(1)));
        dgm.proposeExpulsion{value: 1}(projectId, carol);
    }

    function test_ExpulsionCooldown_AppliesAfterProposalExecution() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);
        _join(projectId, dave);

        uint256 proposalId = _proposeExpulsion(projectId, owner, carol);
        vm.warp(block.timestamp + dgm.EXPULSION_VOTING_PERIOD());
        dgm.executeExpulsion(proposalId);

        vm.prank(owner);
        vm.expectRevert(DontGhostMe.ExpulsionCooldownActive.selector);
        dgm.proposeExpulsion(projectId, dave);

        vm.prank(owner);
        vm.expectRevert(DontGhostMe.ExpulsionCooldownActive.selector);
        dgm.proposeExpulsion(projectId, carol);

        vm.warp(block.timestamp + dgm.EXPULSION_COOLDOWN());
        _proposeExpulsion(projectId, owner, dave);
    }

    function test_ExpulsionProposalLimit_RequiresProtocolAdminExtension() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        for (uint256 i = 0; i < dgm.DEFAULT_MAX_EXPULSION_PROPOSALS(); i++) {
            uint256 proposalId = _proposeExpulsion(projectId, owner, carol);
            vm.warp(block.timestamp + dgm.EXPULSION_VOTING_PERIOD());
            dgm.executeExpulsion(proposalId);
            vm.warp(block.timestamp + dgm.EXPULSION_COOLDOWN());
        }

        vm.prank(owner);
        vm.expectRevert(DontGhostMe.ExpulsionProposalLimitReached.selector);
        dgm.proposeExpulsion(projectId, carol);

        vm.prank(owner);
        vm.expectRevert(DontGhostMe.OnlyProtocolAdmin.selector);
        dgm.approveAdditionalExpulsions(projectId, 1);

        dgm.approveAdditionalExpulsions(projectId, 1);
        assertEq(dgm.getExpulsionProposalLimit(projectId), 11);

        _proposeExpulsion(projectId, owner, carol);
        assertEq(dgm.getExpulsionProposalCount(projectId), 11);
    }

    function test_VoteExpulsion_CountsApproveAndRejectOnce() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        uint256 proposalId = _proposeExpulsion(projectId, owner, carol);

        vm.expectEmit(true, true, false, true);
        emit ExpulsionVoted(proposalId, alice, true);
        vm.prank(alice);
        dgm.voteExpulsion(proposalId, true);

        vm.prank(bob);
        dgm.voteExpulsion(proposalId, false);

        DontGhostMe.ExpulsionProposal memory proposal = dgm.getExpulsionProposal(proposalId);
        assertEq(proposal.approveVotes, 1);
        assertEq(proposal.rejectVotes, 1);
        assertTrue(dgm.hasVoted(proposalId, alice));
        assertTrue(dgm.hasVoted(proposalId, bob));
        assertFalse(dgm.hasVoted(proposalId, carol));
    }

    function test_VoteExpulsion_RevertsWhenTargetVotes() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        uint256 proposalId = _proposeExpulsion(projectId, owner, carol);

        vm.prank(carol);
        vm.expectRevert(DontGhostMe.CannotVoteAsExpulsionTarget.selector);
        dgm.voteExpulsion(proposalId, false);
    }

    function test_VoteExpulsion_RevertsOnDuplicateVote() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        uint256 proposalId = _proposeExpulsion(projectId, owner, carol);

        vm.prank(alice);
        dgm.voteExpulsion(proposalId, true);

        vm.prank(alice);
        vm.expectRevert(DontGhostMe.ExpulsionAlreadyVoted.selector);
        dgm.voteExpulsion(proposalId, false);
    }

    function test_VoteExpulsion_RevertsAfterDeadline() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        uint256 proposalId = _proposeExpulsion(projectId, owner, carol);

        vm.warp(block.timestamp + dgm.EXPULSION_VOTING_PERIOD());

        vm.prank(alice);
        vm.expectRevert(DontGhostMe.ExpulsionVotingEnded.selector);
        dgm.voteExpulsion(proposalId, true);
    }

    function test_ExecuteExpulsion_PassesWithMajorityAndCreatesRescueBounty() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        vm.prank(owner);
        uint256 proposalId = dgm.proposeExpulsionWithReason(projectId, carol, "Missed two delivery checkpoints");

        // 3 active members => majority requires approveVotes > 1
        vm.prank(alice);
        dgm.voteExpulsion(proposalId, true);
        vm.prank(bob);
        dgm.voteExpulsion(proposalId, true);

        vm.warp(block.timestamp + dgm.EXPULSION_VOTING_PERIOD());

        vm.expectEmit(true, true, false, true);
        emit MemberExpelled(projectId, carol, DEPOSIT);

        uint256 expectedBountyId = dgm.nextBountyId();
        vm.expectEmit(true, true, true, true);
        emit BountyCreated(expectedBountyId, projectId, owner, "Missed two delivery checkpoints", DEPOSIT);

        vm.prank(alice);
        dgm.executeExpulsion(proposalId);

        DontGhostMe.ExpulsionProposal memory proposal = dgm.getExpulsionProposal(proposalId);
        DontGhostMe.Member memory expelled = dgm.getMember(projectId, carol);
        DontGhostMe.Project memory project = dgm.getProject(projectId);
        DontGhostMe.Bounty memory bounty = dgm.getBounty(expectedBountyId);

        assertTrue(proposal.executed);
        assertFalse(expelled.active);
        assertEq(expelled.deposit, 0);
        assertEq(project.rescuePool, DEPOSIT);
        assertEq(project.reservedBounty, DEPOSIT);
        assertEq(bounty.reward, DEPOSIT);
        assertEq(bounty.creator, owner);
        assertEq(uint256(bounty.status), uint256(DontGhostMe.BountyStatus.Open));
        assertEq(dgm.getActiveMemberCount(projectId), 2);
        assertEq(dgm.getPendingExpulsionBondRefund(owner), 0);
        assertEq(dgm.getActiveExpulsionProposalByTarget(projectId, carol), 0);
        assertEq(dgm.getActiveExpulsionProposalByProposer(projectId, owner), 0);
    }

    function test_ExecuteExpulsion_DoesNotExpelWithoutMajority() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        uint256 proposalId = _proposeExpulsion(projectId, owner, carol);

        // Only one approve vote: 1 > 3/2 is false
        vm.prank(alice);
        dgm.voteExpulsion(proposalId, true);

        vm.warp(block.timestamp + dgm.EXPULSION_VOTING_PERIOD());
        vm.prank(alice);
        dgm.executeExpulsion(proposalId);

        DontGhostMe.ExpulsionProposal memory proposal = dgm.getExpulsionProposal(proposalId);
        DontGhostMe.Member memory target = dgm.getMember(projectId, carol);
        DontGhostMe.Project memory project = dgm.getProject(projectId);

        assertTrue(proposal.executed);
        assertTrue(target.active);
        assertEq(target.deposit, DEPOSIT);
        assertEq(project.rescuePool, 0);
        assertEq(dgm.getPendingExpulsionBondRefund(owner), 0);
        assertEq(dgm.getActiveMemberCount(projectId), 3);
    }

    function test_ExecuteExpulsion_RevertsBeforeDeadline() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        uint256 proposalId = _proposeExpulsion(projectId, owner, carol);

        vm.prank(alice);
        vm.expectRevert(DontGhostMe.ExpulsionVotingActive.selector);
        dgm.executeExpulsion(proposalId);
    }

    function test_ExecuteExpulsion_RevertsWhenAlreadyExecuted() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        uint256 proposalId = _proposeExpulsion(projectId, owner, carol);

        vm.prank(alice);
        dgm.voteExpulsion(proposalId, true);
        vm.prank(bob);
        dgm.voteExpulsion(proposalId, true);

        vm.warp(block.timestamp + dgm.EXPULSION_VOTING_PERIOD());
        vm.prank(alice);
        dgm.executeExpulsion(proposalId);

        vm.prank(alice);
        vm.expectRevert(DontGhostMe.ExpulsionAlreadyExecuted.selector);
        dgm.executeExpulsion(proposalId);
    }

    function test_ExecuteExpulsion_NoDoubleForfeitIfTargetLeftDuringVote() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        uint256 proposalId = _proposeExpulsion(projectId, owner, carol);

        vm.prank(alice);
        dgm.voteExpulsion(proposalId, true);
        vm.prank(bob);
        dgm.voteExpulsion(proposalId, true);

        // Target leaves voluntarily; deposit already enters rescue pool.
        vm.prank(carol);
        dgm.leaveProject(projectId);

        vm.warp(block.timestamp + dgm.EXPULSION_VOTING_PERIOD());
        vm.prank(alice);
        dgm.executeExpulsion(proposalId);

        DontGhostMe.Project memory project = dgm.getProject(projectId);
        DontGhostMe.Member memory target = dgm.getMember(projectId, carol);

        assertEq(project.rescuePool, DEPOSIT);
        assertEq(project.reservedBounty, 0);
        assertFalse(target.active);
        assertEq(target.deposit, DEPOSIT);
        assertEq(dgm.getPendingExpulsionBondRefund(owner), 0);
        assertEq(dgm.getActiveMemberCount(projectId), 2);
    }

    // ---------------------------------------------------------------------
    // Integration
    // ---------------------------------------------------------------------

    function test_HackathonHappyPath_LeaveThenRescueThenFinish() public {
        uint256 projectId = _createProject();
        _seedThreeMembers(projectId);

        // One member ghosts and funds the rescue pool.
        vm.prank(carol);
        dgm.leaveProject(projectId);

        vm.prank(owner);
        uint256 bountyId = dgm.createBounty(projectId, "Replace frontend", REWARD);

        vm.prank(hunter);
        dgm.claimBounty(bountyId);
        vm.prank(hunter);
        dgm.submitWork(bountyId);

        uint256 hunterBefore = hunter.balance;
        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;

        vm.prank(owner);
        dgm.approveWork(bountyId);

        // Remaining active members finish; deposits auto-refund to each wallet.
        vm.prank(owner);
        dgm.finishProject(projectId);

        assertEq(hunter.balance, hunterBefore + REWARD);
        assertEq(alice.balance, aliceBefore + DEPOSIT);
        assertEq(bob.balance, bobBefore + DEPOSIT);
        assertEq(address(dgm).balance, DEPOSIT - REWARD);
        assertEq(dgm.getActiveMemberCount(projectId), 0);
    }
}
