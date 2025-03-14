const truffleAssert = require('truffle-assertions');
const ERC721LazyPayableClaim = artifacts.require("ERC721LazyPayableClaim");
const ERC721Creator = artifacts.require('@manifoldxyz/creator-core-extensions-solidity/ERC721Creator');
const DelegationRegistry = artifacts.require('DelegationRegistry');
const MockManifoldMembership = artifacts.require('MockManifoldMembership');
const MockERC20 = artifacts.require('MockERC20');

const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const ethers = require('ethers');

contract('LazyPayableClaim721', function ([...accounts]) {
  const [owner, lazyClaimOwner, anyone1] = accounts;
  describe('LazyPayableClaim721 ERC20', function () {
    let creator, lazyClaim;
    let fee, merkleFee;
    beforeEach(async function () {
      creator = await ERC721Creator.new("Test", "TEST", {from:owner});
      delegationRegistry = await DelegationRegistry.new();
      lazyClaim = await ERC721LazyPayableClaim.new(delegationRegistry.address, {from:lazyClaimOwner});
      manifoldMembership = await MockManifoldMembership.new({from:owner});
      lazyClaim.setMembershipAddress(manifoldMembership.address, {from:lazyClaimOwner});
      fee = ethers.BigNumber.from((await lazyClaim.MINT_FEE()).toString());
      merkleFee = ethers.BigNumber.from((await lazyClaim.MINT_FEE_MERKLE()).toString());
      mockERC20 = await MockERC20.new('Test', 'test');

      // Must register with empty prefix in order to set per-token uri's
      await creator.registerExtension(lazyClaim.address, {from:owner});
    });

    it('functionality test', async function() {
      const merkleElements = [];
      merkleElements.push(ethers.utils.solidityPack(['address', 'uint32'], [anyone1, 0]));
      merkleElements.push(ethers.utils.solidityPack(['address', 'uint32'], [anyone1, 1]));
      merkleElements.push(ethers.utils.solidityPack(['address', 'uint32'], [anyone1, 2]));
      merkleTree = new MerkleTree(merkleElements, keccak256, { hashLeaves: true, sortPairs: true });

      // Test initializing a new claim
      let start = (await web3.eth.getBlock('latest')).timestamp - 100; // seconds since unix epoch
      let end = start + 300;

      await lazyClaim.initializeClaim(
        creator.address,
        1,
        {
          merkleRoot: merkleTree.getHexRoot(),
          location: "arweaveHash1",
          totalMax: 3,
          walletMax: 0,
          startDate: start,
          endDate: end,
          storageProtocol: 2,
          identical: true,
          cost: 100,
          paymentReceiver: owner,
          erc20: mockERC20.address,
        },
        {from:owner}
      );

      // Initialize a second claim - with optional parameters disabled
      await lazyClaim.initializeClaim(
        creator.address,
        2,
        {
          merkleRoot: "0x0000000000000000000000000000000000000000000000000000000000000000",
          location: "arweaveHash2",
          totalMax: 0,
          walletMax: 0,
          startDate: 0,
          endDate: 0,
          storageProtocol: 2,
          identical: true,
          cost: 200,
          paymentReceiver: owner,
          erc20: mockERC20.address,
        },
        {from:owner}
      );

      const merkleLeaf1 = keccak256(ethers.utils.solidityPack(['address', 'uint32'], [anyone1, 0]));
      const merkleProof1 = merkleTree.getHexProof(merkleLeaf1);
      const merkleLeaf2 = keccak256(ethers.utils.solidityPack(['address', 'uint32'], [anyone1, 1]));
      const merkleProof2 = merkleTree.getHexProof(merkleLeaf2);
      const merkleLeaf3 = keccak256(ethers.utils.solidityPack(['address', 'uint32'], [anyone1, 2]));
      const merkleProof3 = merkleTree.getHexProof(merkleLeaf3);

      // Cannot mint with no approvals
      await truffleAssert.reverts(lazyClaim.mint(creator.address, 1, 0, merkleProof1, anyone1, {from:anyone1, value: merkleFee}), "ERC20: insufficient allowance");
      await truffleAssert.reverts(lazyClaim.mintBatch(creator.address, 1, 1, [0], [merkleProof1], anyone1, {from:anyone1, value: merkleFee}), "ERC20: insufficient allowance");

      await mockERC20.approve(lazyClaim.address, 1000, {from: anyone1});

      // Cannot mint with no erc20 balance
      await truffleAssert.reverts(lazyClaim.mint(creator.address, 1, 0, merkleProof1, anyone1, {from:anyone1, value: merkleFee}), "ERC20: transfer amount exceeds balance");
      await truffleAssert.reverts(lazyClaim.mintBatch(creator.address, 1, 1, [0], [merkleProof1], anyone1, {from:anyone1, value: merkleFee}), "ERC20: transfer amount exceeds balance");

      // Mint erc20 tokens
      await mockERC20.testMint(anyone1, 1000);

      // Mint a token (merkle)
      await lazyClaim.mint(creator.address, 1, 0, merkleProof1, anyone1, {from:anyone1, value: merkleFee});
      claim = await lazyClaim.getClaim(creator.address, 1);
      assert.equal(claim.total, 1);
      assert.equal(900, await mockERC20.balanceOf(anyone1));
      assert.equal(100, await mockERC20.balanceOf(owner));
      assert.equal(1, await creator.balanceOf(anyone1));

      // Mint batch (merkle)
      await truffleAssert.reverts(lazyClaim.mintBatch(creator.address, 1, 2, [1, 2], [merkleProof2, merkleProof3], anyone1, {from:anyone1, value: merkleFee}), "Invalid amount");
      await truffleAssert.reverts(lazyClaim.mintBatch(creator.address, 1, 2, [1, 2], [merkleProof2, merkleProof3], anyone1, {from:anyone1, value: fee.mul(2)}), "Invalid amount");
      await lazyClaim.mintBatch(creator.address, 1, 2, [1, 2], [merkleProof2, merkleProof3], anyone1, {from:anyone1, value: merkleFee.mul(2)});
      assert.equal(700, await mockERC20.balanceOf(anyone1));
      assert.equal(300, await mockERC20.balanceOf(owner));
      assert.equal(3, await creator.balanceOf(anyone1));

      // Mint a token
      await lazyClaim.mint(creator.address, 2, 0, [], anyone1, {from:anyone1, value: fee});
      claim = await lazyClaim.getClaim(creator.address, 2);
      assert.equal(claim.total, 1);
      assert.equal(500, await mockERC20.balanceOf(anyone1));
      assert.equal(500, await mockERC20.balanceOf(owner));
      assert.equal(4, await creator.balanceOf(anyone1));

      // Mint batch
      await truffleAssert.reverts(lazyClaim.mintBatch(creator.address, 2, 2, [], [], anyone1, {from:anyone1, value: fee}), "Invalid amount");
      await lazyClaim.mintBatch(creator.address, 2, 2, [], [], anyone1, {from:anyone1, value: fee.mul(2)});
      assert.equal(100, await mockERC20.balanceOf(anyone1));
      assert.equal(900, await mockERC20.balanceOf(owner));
      assert.equal(6, await creator.balanceOf(anyone1));

    });

  });
});
