// SPDX-License-Identifier: MIT
//
// FREEDAM Membership (FRDM-ID) Deployment Script
// Usage:
//   npx hardhat run scripts/deploy.js --network optimismSepolia
//   npx hardhat run scripts/deploy.js --network localhost
//
// Requires PRIVATE_KEY in .env for testnet deployment.

const { ethers } = require("hardhat");
const hre = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(50));
  console.log("FREEDAM DAO — FRDM-ID Deployment");
  console.log("=".repeat(50));
  console.log("Deployer address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "ETH");
  console.log("-".repeat(50));

  // Deploy the contract
  console.log("Deploying FREEDAMMembership...");
  const Factory = await ethers.getContractFactory("FREEDAMMembership");
  const contract = await Factory.deploy(deployer.address);

  console.log("Tx hash:", contract.deploymentTransaction()?.hash);
  console.log("Waiting for confirmation...");

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("-".repeat(50));
  console.log("✅ FREEDAMMembership deployed successfully!");
  console.log("   Contract address:", address);
  console.log("   Owner:", deployer.address);
  console.log("   Network:", hre.network.name, "(chainId:", hre.network.config.chainId, ")");
  console.log("-".repeat(50));

  // Verify key functions exist
  const totalMembers = await contract.totalMembers();
  console.log("   totalMembers():", totalMembers.toString());

  console.log("\nNext steps:");
  console.log("  1. Save the contract address above");
  console.log("  2. Verify on block explorer:");
  console.log("     npx hardhat verify --network " + hre.network.name + " " + address + " " + deployer.address);
  console.log("  3. Mint Founder membership:");
  console.log("     npx hardhat console --network " + hre.network.name);
  console.log("     > await contract.founderMint()");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
