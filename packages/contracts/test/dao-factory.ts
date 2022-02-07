import { expect } from 'chai';
import { ethers } from 'hardhat';

const EVENTS = {
  NewDAORegistered: 'NewDAORegistered',
  SetMetadata: 'SetMetadata',
  UpdateConfig: 'UpdateConfig',
  DAOCreated: 'DAOCreated',
  Granted: 'Granted',
  Revoked: 'Revoked',
  EXECUTED: 'Executed'
}

const ERRORS = {
    NameAlreadyInUse: 'name already in use',
    ComponentAuth: 'component: auth',
    ACLAuth: 'acl: auth'
}

const zeroAddress = ethers.constants.AddressZero;
const ACLAnyAddress = "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF";
const ACLAllowFlagAddress = "0x0000000000000000000000000000000000000002";
const daoDummyName = 'dao1';
const daoDummyMetadata = '0x0000';
const dummyVoteSettings = [1, 2, 3];

async function getDeployments(tx: any) {
    const data = await tx.wait()
    const { events } = data
    const { name, dao, token, creator } = events.find(
      ({ event }: { event: any }) => event === EVENTS.NewDAORegistered
    ).args

    const { voting } = events.find(
        ({ event }: { event: any }) => event === EVENTS.DAOCreated
    ).args

    return {
      token: await ethers.getContractAt('GovernanceERC20', token),
      dao: await ethers.getContractAt('DAO', dao),
      SimpleVoting: await ethers.getContractAt('SimpleVoting', voting),
      creator,
      name
    }
}

// This is more like e2e test that tests the whole flow.

describe('DAOFactory: ', function () {
    let daoFactory: any;

    let actionExecuteContract: any; // contract

    let signers: any;
    let ownerAddress: string;

    let mergedABI: any;
    let daoFactoryBytecode: any;

    async function getMergedABI() {
        // @ts-ignore
        const RegistryArtifact = await hre.artifacts.readArtifact('Registry');
        // @ts-ignore
        const DAOFactoryArtifact = await hre.artifacts.readArtifact('DAOFactory');
        // @ts-ignore
        const SimpleVoting = await hre.artifacts.readArtifact('SimpleVoting');
        // @ts-ignore
        const Token = await hre.artifacts.readArtifact('GovernanceERC20');

        return {
            abi: [
                ...DAOFactoryArtifact.abi,
                ...RegistryArtifact.abi.filter((f: any) => f.type === 'event'),
                ...SimpleVoting.abi.filter((f: any) => f.type === 'event'),
                ...Token.abi.filter((f: any) => f.type === 'event'),
            ],
            bytecode: DAOFactoryArtifact.bytecode
        }
    }

    before(async () => {
        signers = await ethers.getSigners();
        ownerAddress = await signers[0].getAddress();

        const { abi, bytecode } = await getMergedABI();

        mergedABI = abi;
        daoFactoryBytecode = bytecode;
    })

    beforeEach(async function () {
        const Registry = await ethers.getContractFactory('Registry');
        const registry = await Registry.deploy();

        const TokenFactory = await ethers.getContractFactory('TokenFactory');
        const tokenFactory = await TokenFactory.deploy();

        const DAOFactory = new ethers.ContractFactory(
            mergedABI, 
            daoFactoryBytecode, 
            signers[0]
        );

        daoFactory = await DAOFactory.deploy(
            registry.address,
            tokenFactory.address
        );

        const ActionExecuteContract = await ethers.getContractFactory('ActionExecute');
        actionExecuteContract = await ActionExecuteContract.deploy();
    });

    it("creates GovernanceWrappedERC20 clone when token is NON-zero", async () => {
        const mintAmount = 100;

        let tx = await daoFactory.newDAO(
            {
                name: daoDummyName, 
                metadata: daoDummyMetadata, 
            },
            {
                addr: zeroAddress, 
                name: 'TokenName',
                symbol: 'TokenSymbol'
            }, 
            {
                receivers: [ownerAddress],
                amounts: [mintAmount]
            },
            dummyVoteSettings
        );

        // get block that tx was mined
        const blockNum = await ethers.provider.getBlockNumber();

        const { name, dao, token, creator, SimpleVoting } = await getDeployments(tx);
    
        expect(name).to.equal(daoDummyName);
        expect(creator).to.equal(ownerAddress);
            
        await ethers.provider.send('evm_mine', []);

        expect(
            await token.getPastVotes(ownerAddress, blockNum)
        ).to.equal(mintAmount);
        
        const MODIFY_CONFIG_ROLE = await SimpleVoting.MODIFY_CONFIG();
        const EXEC_ROLE = await dao.EXEC_ROLE();

        const DAORoles = await Promise.all([
            dao.DAO_CONFIG_ROLE(),
            dao.ROOT_ROLE(),
            dao.WITHDRAW_ROLE(),
            dao.UPGRADE_ROLE(),
            dao.SET_SIGNATURE_VALIDATOR_ROLE()
        ]);

        // ======== Test Role events that were emitted successfully ==========

        tx = expect(tx);
        
        // Check if correct ACL events are thrown.
        tx = tx.to.emit(dao, EVENTS.SetMetadata)
            .withArgs(daoDummyMetadata)
            .to.emit(SimpleVoting, EVENTS.UpdateConfig)
            .withArgs(dummyVoteSettings[1], dummyVoteSettings[0])
        

        // @ts-ignore
        DAORoles.map(item => {
            tx = tx.to.emit(dao, EVENTS.Granted).withArgs(
                item, 
                daoFactory.address, 
                dao.address, 
                dao.address, 
                ACLAllowFlagAddress
            )
        });
            
        tx = tx.to.emit(dao, EVENTS.Granted)
            .withArgs(
                MODIFY_CONFIG_ROLE, 
                daoFactory.address, 
                dao.address, 
                SimpleVoting.address, 
                ACLAllowFlagAddress
            )
            .to.emit(dao, EVENTS.Revoked)
            .withArgs(
                DAORoles[1], 
                daoFactory.address, 
                daoFactory.address, 
                dao.address
            )
            .to.emit(dao, EVENTS.Granted)
            .withArgs(
                EXEC_ROLE, 
                daoFactory.address, 
                SimpleVoting.address, 
                dao.address, 
                ACLAllowFlagAddress
            );

        
        // ===== Test if user can create a vote and execute it ======

        // should be only callable by simplevoting
        await expect(
            dao.execute([])
        ).to.be.revertedWith(ERRORS.ACLAuth);
        
        await expect(
            SimpleVoting.changeVoteConfig(1, 2)
        ).to.be.revertedWith(ERRORS.ComponentAuth);

        const actions = [
            {
                to: actionExecuteContract.address,
                value: 0,
                data: actionExecuteContract.interface.encodeFunctionData(
                    'setTest',
                    []
                )
            },
            {
                to: SimpleVoting.address,
                value: 0,
                data: SimpleVoting.interface.encodeFunctionData(
                    'changeVoteConfig',
                    [5, 4]
                )
            }
        ];

        await SimpleVoting.newVote("0x", actions, false, false);
        
        expect(await SimpleVoting.vote(0, true, true))
            .to.emit(dao, EVENTS.EXECUTED)
            .withArgs(SimpleVoting.address, [], [])
            .to.emit(SimpleVoting, EVENTS.UpdateConfig)
            .withArgs(5, 4);

        expect(await actionExecuteContract.test()).to.equal(true);
    })
});