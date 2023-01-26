## Traces-contracts

This project, concepted by [Fingerprints DAO](https://fingerprintsdao.xyz/) and developed by [Arod Studio](http://arodstudio.xyz/) is an open-source smart contract to enable members of Fingerprints DAO to "borrow" and use the NFTs from the DAO vault. Check out on our website [traces.fingerprintsdao.xyz](https://traces.fingerprintsdao.xyz/).

This smart contract project uses Solidity. It utilizes the [@openzeppelin/contracts](https://www.npmjs.com/package/@openzeppelin/contracts) and [@openzeppelin/contracts-upgradeable](https://www.npmjs.com/package/@openzeppelin/contracts-upgradeable) libraries for building secure and upgradeable smart contracts.

## Getting Started

To get started with this project, you will need to have the following dependencies installed:

- Node.js
- Hardhat
- TypeScript


Then, clone the repository and install the dependencies:

```sh
git clone git@github-arod:Fingerprints-DAO/traces-contracts.git
cd traces-contracts
npm install
```


You will also need to configure the following environment variables in a `.env` file at the root of the project:

-   `ACCOUNT_ADDRESS`: The Ethereum address you want to use to deploy the contract.
-   `ETHERSCAN_API_KEY`: Your API key for Etherscan, used for contract verification.
-   `INFURA_API_KEY`: Your API key for Infura, used for connecting to the Ethereum network.
-   `MNEMONIC`: The mnemonic for the Ethereum account you're using to deploy the contract. You can also use `PRIVATE_KEY` if you don't want to use a mnemonic.
-   `REPORT_GAS`: A boolean indicating whether or not to report gas usage for the contract.
-   `METADATA_URL`: The URL for the metadata API.


## Running locally
To run the project locally, you need to execute the following commands:

```sh
yarn task:run-local
```

This script deploys an ERC721 contract, an ERC20 contract and the Traces contract. It also mints 10 NFTs and 1000 tokens to the account that deployed the contracts. It also mints 1000 tokens to the account that will be used to borrow the NFTs. Check out the script in `tasks/run-local.ts` to see how the contracts are deployed and arguments that you can use to customize the deployment.


## Compiling Contracts

To compile the contracts, run the following command:

`yarn compile` 

## Deploying Contracts

To deploy the contracts to the Goerli testnet, run the following command:

`yarn deploy:goerli`

You can check the script in `tasks/deploy.ts` to see how the contracts are deployed and arguments that you can use to customize the deployment.

## Running Tests

To run the tests, use the following command:

`yarn test:watch` If you want to run the tests in watch mode.

`yarn test` If you want to run the tests once.

## Running Coverage

To run the coverage, use the following command:

`yarn coverage`

## Generating Documentation

To generate documentation for the contracts, use the following command:

`yarn run:docs` 

## Author

Traces-contracts was created by arodundef [arod.mail@protonmail.com](mailto:arod.mail@protonmail.com).

## License

Traces-contracts is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).