export const mockAbi = [
  'function createProject(tuple project) returns (uint256 projectId)',
  'function confirmParticipation(uint256 projectId)',
  'function lockDeposit(uint256 projectId,uint256 amount)',
  'function quitProject(uint256 projectId,bytes32 memberId)',
  'function advanceProject(uint256 projectId)',
  'function completeProject(uint256 projectId)',
  'function batchResolveBounties(uint256 projectId)',
  'function createBounty(uint256 projectId,tuple bounty) returns (uint256 bountyId)',
  'function claimBounty(uint256 bountyId)',
  'function cancelBountyClaim(uint256 bountyId)',
  'function submitWork(uint256 bountyId,string githubUrl,string demoUrl,string metadataUri)',
  'function requestRevision(uint256 bountyId,string feedback)',
  'function approveAndPay(uint256 bountyId)',
  'function getProject(uint256 projectId) view returns (tuple)',
  'function getBounty(uint256 bountyId) view returns (tuple)',
  'function getWalletBalance(address account) view returns (uint256)',
] as const

export const futureContractFunctionNames = mockAbi.map((signature) =>
  signature.slice('function '.length, signature.indexOf('(')),
)
