import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, SchemaTypes, Types } from 'mongoose'
import { User } from '../../users/schemas/user.schema'
import { ApiKey } from './api-key.schema'

export type AccessFootprintDocument = AccessFootprint & Document

/**
 * One distinct origin an account has been used from: a channel and an address,
 * with the region the edge placed it in.
 *
 * One document per account, channel and address, never one per request. A
 * repeat from an origin already recorded moves lastSeenAt and writes nothing
 * else, and within the recorder's window it writes nothing at all.
 */
@Schema({ collection: 'accessfootprints', timestamps: false })
export class AccessFootprint {
  _id?: Types.ObjectId

  @Prop({ type: SchemaTypes.ObjectId, ref: User.name, required: true })
  user: User | Types.ObjectId

  // web, api or device. See ACCESS_CHANNELS.
  @Prop({ type: String, required: true })
  channel: string

  // IPv4 whole, IPv6 as its /64 network. See canonicalAddress.
  @Prop({ type: String, required: true })
  ip: string

  @Prop({ type: String })
  country?: string

  @Prop({ type: String })
  region?: string

  @Prop({ type: String })
  regionCode?: string

  @Prop({ type: String })
  city?: string

  @Prop({ type: String })
  timezone?: string

  // Autonomous system number of the caller's network.
  @Prop({ type: Number })
  asn?: number

  // Bounded family label for the caller, for example textbee-js or curl.
  @Prop({ type: String })
  client?: string

  // The key this origin presented, when it presented one. A key used from many
  // origins is the signal that it has been copied somewhere unexpected.
  @Prop({ type: SchemaTypes.ObjectId, ref: ApiKey.name })
  apiKey?: ApiKey | Types.ObjectId

  @Prop({ type: Date, required: true })
  firstSeenAt: Date

  @Prop({ type: Date, required: true })
  lastSeenAt: Date
}

export const AccessFootprintSchema =
  SchemaFactory.createForClass(AccessFootprint)

// The identity of a row. Unique so a concurrent first sighting cannot write
// the same origin twice, and the recorder can tell an insert from a refresh.
AccessFootprintSchema.index({ user: 1, channel: 1, ip: 1 }, { unique: true })

// The reach report reads a window of lastSeenAt.
AccessFootprintSchema.index({ lastSeenAt: 1 })
