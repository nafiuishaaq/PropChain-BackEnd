import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../database/prisma.service';
import { TransactionFeesService } from './transaction-fees.service';
import { CreateTransactionDto, CalculateFeesDto } from './dto/transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feesService: TransactionFeesService,
  ) {}

  calculateFees(dto: CalculateFeesDto) {
    return this.feesService.calculateFees(dto.amount, dto.agentCommissionRate);
  }

  async create(dto: CreateTransactionDto) {
    const { amount, propertyId, buyerId, sellerId, type, notes, blockchainHash, contractAddress } =
      dto;

    return this.prisma.transaction.create({
      data: {
        amount: new Decimal(amount.toString()),
        type,
        notes,
        blockchainHash,
        contractAddress,
        property: { connect: { id: propertyId } },
        buyer: { connect: { id: buyerId } },
        seller: { connect: { id: sellerId } },
      },
      include: {
        property: { select: { id: true, title: true, address: true } },
        buyer: { select: { id: true, firstName: true, lastName: true, email: true } },
        seller: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async findAll() {
    return this.prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        property: { select: { id: true, title: true, address: true } },
        buyer: { select: { id: true, firstName: true, lastName: true } },
        seller: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findOne(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        property: { select: { id: true, title: true, address: true } },
        buyer: { select: { id: true, firstName: true, lastName: true, email: true } },
        seller: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!transaction) throw new NotFoundException(`Transaction ${id} not found`);
    return transaction;
  }

  async findWithFees(id: string) {
    const transaction = await this.findOne(id);
    const fees = this.feesService.calculateFees(Number(transaction.amount));
    return { ...transaction, fees };
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../database/prisma.service';
import { TransactionStatus, TransactionType } from '../types/prisma.types';
import {
  canTransitionTransactionStatus,
  DEFAULT_TRANSACTION_STATUS,
} from './transaction-status.constants';

export interface CreateTransactionInput {
  propertyId: string;
  buyerId: string;
  sellerId: string;
  amount: Decimal | number | string;
  type: TransactionType;
  status?: TransactionStatus;
  blockchainHash?: string | null;
  contractAddress?: string | null;
  notes?: string | null;
}

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTransaction(input: CreateTransactionInput) {
    return this.prisma.transaction.create({
      data: {
        ...input,
        status: input.status ?? DEFAULT_TRANSACTION_STATUS,
      },
    });
  }

  async updateTransactionStatus(transactionId: string, status: TransactionStatus) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
    }

    if (!canTransitionTransactionStatus(transaction.status as TransactionStatus, status)) {
      throw new BadRequestException(
        `Transaction status cannot transition from ${transaction.status} to ${status}`,
      );
    }

    if (transaction.status === status) {
      return transaction;
    }

    return this.prisma.transaction.update({
      where: { id: transactionId },
      data: { status },
    });
  }
}
