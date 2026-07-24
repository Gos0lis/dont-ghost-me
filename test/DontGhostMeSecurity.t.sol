// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {DontGhostMe} from "../src/DontGhostMe.sol";
import {IDontGhostMe} from "../src/IDontGhostMe.sol";

contract ReentrantWithdrawer {
    DontGhostMe internal immutable _dgm;
    uint256 internal _projectId;

    bool public reentrySucceeded;
    uint256 public receiveCount;

    constructor(DontGhostMe dgm) {
        _dgm = dgm;
    }

    function join(uint256 projectId) external payable {
        _projectId = projectId;
        _dgm.joinProject{value: msg.value}(projectId);
    }

    function withdraw() external {
        _dgm.withdrawDeposit(_projectId);
    }

    receive() external payable {
        receiveCount += 1;
        if (receiveCount == 1) {
            (reentrySucceeded,) =
                address(_dgm).call(abi.encodeWithSelector(DontGhostMe.withdrawDeposit.selector, _projectId));
        }
    }
}

contract ReentrantHunter {
    DontGhostMe internal immutable _dgm;
    uint256 internal _bountyId;

    bool public reentrySucceeded;
    uint256 public receiveCount;

    constructor(DontGhostMe dgm) {
        _dgm = dgm;
    }

    function claimAndSubmit(uint256 bountyId) external {
        _bountyId = bountyId;
        _dgm.claimBounty(bountyId);
        _dgm.submitWork(bountyId);
    }

    receive() external payable {
        receiveCount += 1;
        if (receiveCount == 1) {
            (reentrySucceeded,) = address(_dgm).call(abi.encodeWithSelector(DontGhostMe.submitWork.selector, _bountyId));
        }
    }
}

contract DontGhostMeSecurityTest is Test {
    DontGhostMe internal dgm;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal hunter = makeAddr("hunter");

    function setUp() public {
        dgm = new DontGhostMe();
        vm.deal(owner, 1_000 ether);
        vm.deal(alice, 1_000 ether);
        vm.deal(hunter, 1_000 ether);
    }

    function _createProject(uint256 deposit) internal returns (uint256 projectId) {
        vm.prank(owner);
        projectId = dgm.createProject("Security review", deposit);
    }

    function _fundRescuePool(uint256 projectId, uint256 deposit) internal {
        vm.prank(alice);
        dgm.joinProject{value: deposit}(projectId);

        vm.prank(alice);
        dgm.leaveProject(projectId);
    }

    function _createSubmittedBounty(uint256 deposit, uint256 reward)
        internal
        returns (uint256 projectId, uint256 bountyId)
    {
        projectId = _createProject(deposit);
        _fundRescuePool(projectId, deposit);

        vm.prank(owner);
        bountyId = dgm.createBounty(projectId, "Security bounty", reward);

        vm.prank(hunter);
        dgm.claimBounty(bountyId);

        vm.prank(hunter);
        dgm.submitWork(bountyId);
    }

    function testFuzz_AccountingInvariant_AfterBountyPayment(uint96 depositSeed, uint96 rewardSeed) public {
        uint256 deposit = bound(uint256(depositSeed), 1 wei, 100 ether);
        uint256 reward = bound(uint256(rewardSeed), 1 wei, deposit);
        uint256 projectId = _createProject(deposit);
        _fundRescuePool(projectId, deposit);

        vm.prank(owner);
        uint256 bountyId = dgm.createBounty(projectId, "Fuzz bounty", reward);

        vm.prank(hunter);
        dgm.claimBounty(bountyId);
        vm.prank(hunter);
        dgm.submitWork(bountyId);

        uint256 hunterBefore = hunter.balance;
        vm.prank(owner);
        dgm.approveWork(bountyId);

        DontGhostMe.Project memory project = dgm.getProject(projectId);
        assertEq(project.rescuePool, deposit - reward);
        assertEq(project.reservedBounty, 0);
        assertEq(dgm.getAvailableRescuePool(projectId), deposit - reward);
        assertEq(address(dgm).balance, deposit - reward);
        assertEq(hunter.balance, hunterBefore + reward);
        assertLe(project.reservedBounty, project.rescuePool);
    }

    function testFuzz_AccountingInvariant_CancelPreservesPool(uint96 depositSeed, uint96 rewardSeed) public {
        uint256 deposit = bound(uint256(depositSeed), 1 wei, 100 ether);
        uint256 reward = bound(uint256(rewardSeed), 1 wei, deposit);
        uint256 projectId = _createProject(deposit);
        _fundRescuePool(projectId, deposit);

        vm.prank(owner);
        uint256 bountyId = dgm.createBounty(projectId, "Cancelled bounty", reward);

        vm.prank(owner);
        dgm.cancelBounty(bountyId);

        DontGhostMe.Project memory project = dgm.getProject(projectId);
        assertEq(project.rescuePool, deposit);
        assertEq(project.reservedBounty, 0);
        assertEq(address(dgm).balance, deposit);
        assertLe(project.reservedBounty, project.rescuePool);
    }

    function test_WithdrawDeposit_BlocksReentrancy() public {
        uint256 deposit = 1 ether;
        uint256 projectId = _createProject(deposit);
        ReentrantWithdrawer attacker = new ReentrantWithdrawer(dgm);

        attacker.join{value: deposit}(projectId);

        vm.prank(owner);
        dgm.finishProject(projectId);

        attacker.withdraw();

        assertFalse(attacker.reentrySucceeded());
        assertEq(attacker.receiveCount(), 1);
        assertEq(address(attacker).balance, deposit);
        assertEq(address(dgm).balance, 0);
    }

    function test_ApproveWork_BlocksReentrantStateChange() public {
        uint256 deposit = 1 ether;
        uint256 reward = 0.8 ether;
        uint256 projectId = _createProject(deposit);
        _fundRescuePool(projectId, deposit);

        vm.prank(owner);
        uint256 bountyId = dgm.createBounty(projectId, "Reentrancy bounty", reward);

        ReentrantHunter attacker = new ReentrantHunter(dgm);
        attacker.claimAndSubmit(bountyId);

        vm.prank(owner);
        dgm.approveWork(bountyId);

        DontGhostMe.Bounty memory bounty = dgm.getBounty(bountyId);
        assertFalse(attacker.reentrySucceeded());
        assertEq(attacker.receiveCount(), 1);
        assertEq(address(attacker).balance, reward);
        assertEq(uint256(bounty.status), uint256(DontGhostMe.BountyStatus.Paid));
    }

    function test_InterfaceSelectors_MatchImplementation() public pure {
        assertEq(IDontGhostMe.EXPULSION_VOTING_PERIOD.selector, bytes4(keccak256("EXPULSION_VOTING_PERIOD()")));
        assertEq(IDontGhostMe.EXPULSION_COOLDOWN.selector, bytes4(keccak256("EXPULSION_COOLDOWN()")));
        assertEq(
            IDontGhostMe.DEFAULT_MAX_EXPULSION_PROPOSALS.selector,
            bytes4(keccak256("DEFAULT_MAX_EXPULSION_PROPOSALS()"))
        );
        assertEq(IDontGhostMe.EXPULSION_BOND_BPS.selector, bytes4(keccak256("EXPULSION_BOND_BPS()")));
        assertEq(IDontGhostMe.FAILED_EXPULSION_SLASH_BPS.selector, bytes4(keccak256("FAILED_EXPULSION_SLASH_BPS()")));
        assertEq(IDontGhostMe.BPS_DENOMINATOR.selector, bytes4(keccak256("BPS_DENOMINATOR()")));
        assertEq(IDontGhostMe.BOUNTY_REVIEW_PERIOD.selector, bytes4(keccak256("BOUNTY_REVIEW_PERIOD()")));
        assertEq(IDontGhostMe.BOUNTY_CLAIM_PERIOD.selector, bytes4(keccak256("BOUNTY_CLAIM_PERIOD()")));
        assertEq(IDontGhostMe.RESCUE_POOL_CLAIM_PERIOD.selector, bytes4(keccak256("RESCUE_POOL_CLAIM_PERIOD()")));
        assertEq(IDontGhostMe.nextProjectId.selector, bytes4(keccak256("nextProjectId()")));
        assertEq(IDontGhostMe.nextBountyId.selector, bytes4(keccak256("nextBountyId()")));
        assertEq(IDontGhostMe.nextExpulsionId.selector, bytes4(keccak256("nextExpulsionId()")));
        assertEq(IDontGhostMe.protocolAdmin.selector, bytes4(keccak256("protocolAdmin()")));
        assertEq(IDontGhostMe.createProject.selector, DontGhostMe.createProject.selector);
        assertEq(IDontGhostMe.finishProject.selector, DontGhostMe.finishProject.selector);
        assertEq(IDontGhostMe.cancelProject.selector, DontGhostMe.cancelProject.selector);
        assertEq(IDontGhostMe.joinProject.selector, DontGhostMe.joinProject.selector);
        assertEq(IDontGhostMe.leaveProject.selector, DontGhostMe.leaveProject.selector);
        assertEq(IDontGhostMe.withdrawDeposit.selector, DontGhostMe.withdrawDeposit.selector);
        assertEq(IDontGhostMe.createBounty.selector, DontGhostMe.createBounty.selector);
        assertEq(IDontGhostMe.claimBounty.selector, DontGhostMe.claimBounty.selector);
        assertEq(IDontGhostMe.cancelClaim.selector, DontGhostMe.cancelClaim.selector);
        assertEq(IDontGhostMe.submitWork.selector, DontGhostMe.submitWork.selector);
        assertEq(IDontGhostMe.requestRevision.selector, DontGhostMe.requestRevision.selector);
        assertEq(IDontGhostMe.rejectWork.selector, DontGhostMe.rejectWork.selector);
        assertEq(IDontGhostMe.approveWork.selector, DontGhostMe.approveWork.selector);
        assertEq(IDontGhostMe.cancelBounty.selector, DontGhostMe.cancelBounty.selector);
        assertEq(IDontGhostMe.cancelSubmittedBounty.selector, DontGhostMe.cancelSubmittedBounty.selector);
        assertEq(IDontGhostMe.cancelStaleBounty.selector, DontGhostMe.cancelStaleBounty.selector);
        assertEq(IDontGhostMe.proposeExpulsion.selector, DontGhostMe.proposeExpulsion.selector);
        assertEq(IDontGhostMe.approveAdditionalExpulsions.selector, DontGhostMe.approveAdditionalExpulsions.selector);
        assertEq(IDontGhostMe.voteExpulsion.selector, DontGhostMe.voteExpulsion.selector);
        assertEq(IDontGhostMe.executeExpulsion.selector, DontGhostMe.executeExpulsion.selector);
        assertEq(IDontGhostMe.withdrawExpulsionBondRefund.selector, DontGhostMe.withdrawExpulsionBondRefund.selector);
        assertEq(IDontGhostMe.withdrawRemainingRescuePool.selector, DontGhostMe.withdrawRemainingRescuePool.selector);
        assertEq(IDontGhostMe.sweepUnclaimedRescuePool.selector, DontGhostMe.sweepUnclaimedRescuePool.selector);
        assertEq(IDontGhostMe.getProject.selector, DontGhostMe.getProject.selector);
        assertEq(IDontGhostMe.getMember.selector, DontGhostMe.getMember.selector);
        assertEq(IDontGhostMe.getBounty.selector, DontGhostMe.getBounty.selector);
        assertEq(IDontGhostMe.getExpulsionProposal.selector, DontGhostMe.getExpulsionProposal.selector);
        assertEq(IDontGhostMe.hasVoted.selector, DontGhostMe.hasVoted.selector);
        assertEq(IDontGhostMe.getRequiredExpulsionBond.selector, DontGhostMe.getRequiredExpulsionBond.selector);
        assertEq(IDontGhostMe.getExpulsionProposalCount.selector, DontGhostMe.getExpulsionProposalCount.selector);
        assertEq(IDontGhostMe.getExpulsionProposalLimit.selector, DontGhostMe.getExpulsionProposalLimit.selector);
        assertEq(
            IDontGhostMe.getPendingExpulsionBondRefund.selector, DontGhostMe.getPendingExpulsionBondRefund.selector
        );
        assertEq(IDontGhostMe.getActiveMemberCount.selector, DontGhostMe.getActiveMemberCount.selector);
        assertEq(IDontGhostMe.getRescuePoolSettlement.selector, DontGhostMe.getRescuePoolSettlement.selector);
        assertEq(
            IDontGhostMe.hasWithdrawnRemainingRescuePool.selector, DontGhostMe.hasWithdrawnRemainingRescuePool.selector
        );
        assertEq(IDontGhostMe.getAvailableRescuePool.selector, DontGhostMe.getAvailableRescuePool.selector);
    }

    function test_InterfaceStructs_DecodeImplementationResponses() public {
        IDontGhostMe interfaceContract = IDontGhostMe(address(dgm));
        uint256 projectId = _createProject(1 ether);

        vm.prank(alice);
        interfaceContract.joinProject{value: 1 ether}(projectId);

        IDontGhostMe.Project memory project = interfaceContract.getProject(projectId);
        IDontGhostMe.Member memory member = interfaceContract.getMember(projectId, alice);
        assertEq(project.id, projectId);
        assertEq(project.owner, owner);
        assertEq(project.name, "Security review");
        assertEq(project.depositAmount, 1 ether);
        assertEq(uint256(project.status), uint256(IDontGhostMe.ProjectStatus.Active));
        assertEq(member.account, alice);
        assertEq(member.deposit, 1 ether);
        assertTrue(member.active);

        vm.prank(alice);
        interfaceContract.leaveProject(projectId);
        vm.prank(owner);
        uint256 bountyId = interfaceContract.createBounty(projectId, "ABI bounty", 0.8 ether);

        IDontGhostMe.Bounty memory bounty = interfaceContract.getBounty(bountyId);
        assertEq(bounty.id, bountyId);
        assertEq(bounty.projectId, projectId);
        assertEq(bounty.description, "ABI bounty");
        assertEq(bounty.reward, 0.8 ether);
        assertEq(bounty.creator, owner);
        assertEq(uint256(bounty.status), uint256(IDontGhostMe.BountyStatus.Open));

        uint256 governanceProjectId = _createProject(1 ether);
        vm.prank(owner);
        interfaceContract.joinProject{value: 1 ether}(governanceProjectId);
        vm.prank(alice);
        interfaceContract.joinProject{value: 1 ether}(governanceProjectId);
        vm.prank(hunter);
        interfaceContract.joinProject{value: 1 ether}(governanceProjectId);

        uint256 bond = interfaceContract.getRequiredExpulsionBond(governanceProjectId);
        vm.prank(owner);
        uint256 proposalId = interfaceContract.proposeExpulsion{value: bond}(governanceProjectId, hunter);

        IDontGhostMe.ExpulsionProposal memory proposal = interfaceContract.getExpulsionProposal(proposalId);
        assertEq(proposal.id, proposalId);
        assertEq(proposal.projectId, governanceProjectId);
        assertEq(proposal.target, hunter);
        assertEq(proposal.proposer, owner);
        assertEq(proposal.bondAmount, bond);
        assertFalse(proposal.executed);
    }

    function test_SubmittedBounty_CancellationUnblocksCompletion() public {
        (uint256 projectId, uint256 bountyId) = _createSubmittedBounty(1 ether, 0.8 ether);

        vm.prank(owner);
        vm.expectRevert("Project has reserved bounties");
        dgm.finishProject(projectId);

        vm.prank(owner);
        dgm.cancelSubmittedBounty(bountyId, "Submission cancelled after review");

        vm.prank(owner);
        dgm.finishProject(projectId);

        assertEq(dgm.getProject(projectId).reservedBounty, 0);
        assertEq(uint256(dgm.getBounty(bountyId).status), uint256(DontGhostMe.BountyStatus.Cancelled));
    }

    function test_RescuePoolRemainder_CanBeSweptWhenNoEligibleMembers() public {
        (uint256 projectId, uint256 bountyId) = _createSubmittedBounty(1 ether, 0.8 ether);

        vm.prank(owner);
        dgm.approveWork(bountyId);

        vm.prank(owner);
        dgm.finishProject(projectId);

        uint256 ownerBefore = owner.balance;
        vm.prank(owner);
        dgm.sweepUnclaimedRescuePool(projectId);

        assertEq(owner.balance, ownerBefore + 0.2 ether);
        assertEq(dgm.getProject(projectId).rescuePool, 0);
        assertEq(address(dgm).balance, 0);
    }
}
